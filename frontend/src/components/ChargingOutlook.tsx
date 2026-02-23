import React, { useState, useEffect, useCallback } from 'react'
import { Card, Typography, Box, CircularProgress, Collapse } from '@mui/material'
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { formatHour12 } from '../utils/constants'

interface OutlookData {
  text: string
  generated_at: string
  cached: boolean
  pending?: boolean
  error?: boolean
}

const POLL_INTERVAL = 30 * 60 * 1000 // 30 minutes
const ERROR_RETRY_INTERVAL = 30 * 1000 // 30s retry when AI is down

/** Strip any JSON/bracket artifacts from the outlook text */
function cleanText(raw: string): string {
  let text = raw.trim()
  // If it looks like JSON, try to extract a string value
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed === 'string') return parsed
      if (typeof parsed === 'object' && parsed !== null) {
        // Grab the first long string value
        for (const v of Object.values(parsed)) {
          if (typeof v === 'string' && v.length > 20) return v
        }
      }
    } catch {
      // Not valid JSON, strip brackets
    }
  }
  // Strip stray brackets/braces
  text = text.replace(/^\{|\}$|^\[|\]$/g, '').trim()
  // Strip quotes wrapping the whole string
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1)
  }
  return text
}

export function ChargingOutlook() {
  const [outlook, setOutlook] = useState<OutlookData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState(false)

  const retryRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOutlook = useCallback(async (force = false) => {
    setLoading(true)
    setError(false)
    try {
      const resp = await apiFetch(`/api/outlook${force ? '?force=true' : ''}`)
      if (resp.ok) {
        const data: OutlookData = await resp.json()
        setOutlook(data)
        if (data.error || (!data.generated_at && data.text)) {
          // Backend returned an error state — schedule a retry
          setError(true)
          retryRef.current = setTimeout(() => fetchOutlook(), ERROR_RETRY_INTERVAL)
        } else if (data.pending) {
          retryRef.current = setTimeout(() => fetchOutlook(), 15000)
        }
      } else {
        setError(true)
        retryRef.current = setTimeout(() => fetchOutlook(), ERROR_RETRY_INTERVAL)
      }
    } catch {
      setError(true)
      retryRef.current = setTimeout(() => fetchOutlook(), ERROR_RETRY_INTERVAL)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount and poll every hour
  useEffect(() => {
    fetchOutlook()
    const interval = setInterval(() => fetchOutlook(), POLL_INTERVAL)
    return () => {
      clearInterval(interval)
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [fetchOutlook])

  // Brief indicator for collapsed state
  const briefIndicator = () => {
    if (loading && !outlook) return 'Loading...'
    if (error) return 'Unavailable'
    if (!outlook?.text) return 'No data'
    const clean = cleanText(outlook.text)
    return clean.length > 80 ? clean.substring(0, 80).trim() + '…' : clean
  }

  return (
    <Card
      sx={{
        p: 2.5,
        mb: 2,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        border: expanded ? '1px solid rgba(168,85,247,0.3)' : '1px solid transparent',
        '&:hover': { borderColor: 'rgba(168,85,247,0.2)' },
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header — always visible */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkles size={16} color="#a855f7" />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
          >
            Charging Outlook
          </Typography>
          {loading && <CircularProgress size={12} sx={{ color: '#a855f7', ml: 0.5 }} />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {outlook?.generated_at && (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
              {formatHour12(outlook.generated_at)}
            </Typography>
          )}
          {expanded ? (
            <ChevronUp size={14} color="#4a6382" />
          ) : (
            <ChevronDown size={14} color="#4a6382" />
          )}
        </Box>
      </Box>

      {/* Collapsed preview */}
      {!expanded && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.75,
            fontSize: '0.875rem',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {briefIndicator()}
        </Typography>
      )}

      {/* Expanded content */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #2a3f57' }}>
          {error ? (
            <Box>
              <Typography variant="body2" color="error" sx={{ fontSize: '0.9rem' }}>
                AI service temporarily unavailable — retrying automatically.
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                Will retry every 30 seconds. You can also tap Refresh.
              </Typography>
            </Box>
          ) : outlook?.text ? (
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ fontSize: '0.95rem', lineHeight: 1.7 }}
            >
              {cleanText(outlook.text)}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.9rem' }}>
              Waiting for forecast data...
            </Typography>
          )}
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}
          >
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
              AI-generated · Updates every 30 min · Does not control charging
            </Typography>
            <Box
              component="span"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                if (retryRef.current) clearTimeout(retryRef.current)
                fetchOutlook(true)
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                color: '#4a6382',
                '&:hover': { color: '#a855f7' },
                fontSize: '0.75rem',
              }}
            >
              <RefreshCw size={10} />
              Refresh
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Card>
  )
}
