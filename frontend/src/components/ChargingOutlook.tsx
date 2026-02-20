import React, { useState, useEffect, useCallback } from 'react'
import { Card, Typography, Box, CircularProgress, Collapse } from '@mui/material'
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api'

interface OutlookData {
  text: string
  generated_at: string
  cached: boolean
}

const POLL_INTERVAL = 60 * 60 * 1000 // 1 hour

export function ChargingOutlook() {
  const [outlook, setOutlook] = useState<OutlookData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(false)

  const fetchOutlook = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const resp = await apiFetch('/api/outlook')
      if (resp.ok) {
        const data: OutlookData = await resp.json()
        setOutlook(data)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount and poll every hour
  useEffect(() => {
    fetchOutlook()
    const interval = setInterval(fetchOutlook, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchOutlook])

  // Brief indicator for collapsed state
  const briefIndicator = () => {
    if (loading && !outlook) return 'Loading...'
    if (error) return 'Unavailable'
    if (!outlook?.text) return 'No data'
    // First ~60 chars of the outlook
    const preview = outlook.text.length > 60
      ? outlook.text.substring(0, 60).trim() + '…'
      : outlook.text
    return preview
  }

  return (
    <Card
      sx={{
        p: 2.5,
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
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
              {outlook.generated_at}
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
            fontSize: '0.8rem',
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
            <Typography variant="body2" color="error" sx={{ fontSize: '0.8rem' }}>
              Unable to generate outlook — AI service unavailable.
            </Typography>
          ) : outlook?.text ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}
            >
              {outlook.text}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.8rem' }}>
              Waiting for forecast data...
            </Typography>
          )}
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}
          >
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
              AI-generated · Updates hourly · Does not control charging
            </Typography>
            <Box
              component="span"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                fetchOutlook()
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                color: '#4a6382',
                '&:hover': { color: '#a855f7' },
                fontSize: '0.65rem',
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
