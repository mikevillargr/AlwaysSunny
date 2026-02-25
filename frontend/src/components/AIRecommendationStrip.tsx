import React from 'react'
import { Box, Typography, Chip, Switch, FormControlLabel, CircularProgress } from '@mui/material'
import { Bot, TrendingUp, AlertTriangle } from 'lucide-react'
import type { AIConfidence } from '../types/api'

interface AIRecommendationStripProps {
  autoOptimize: boolean
  onAutoOptimizeChange: (value: boolean) => void
  aiRecommendedAmps: number
  aiConfidence: AIConfidence
  aiReasoning: string
  aiStatus?: string
  aiModelUsed?: string
  tessieEnabled?: boolean
  chargePortConnected?: boolean
  loading?: boolean
}
export function AIRecommendationStrip({
  autoOptimize,
  onAutoOptimizeChange,
  aiRecommendedAmps,
  aiConfidence,
  aiReasoning,
  aiStatus = 'standby',
  aiModelUsed = '',
  tessieEnabled = true,
  chargePortConnected = false,
  loading = false,
}: AIRecommendationStripProps) {
  const aiToggleEnabled = tessieEnabled && chargePortConnected
  // Visual state: show as OFF when the toggle can't function (car unplugged, Tessie off)
  const visuallyActive = autoOptimize && aiToggleEnabled
  const isError = aiStatus.startsWith('error:')
  const isFallback = aiStatus === 'fallback' || isError
  const isPending = aiStatus === 'pending'
  const isWaiting = visuallyActive && (!aiReasoning || isPending) && !isError

  // Determine lockout reason
  const lockoutReason = !tessieEnabled
    ? 'Enable Tessie connection to use AI optimization'
    : !chargePortConnected
      ? 'Plug in your Tesla to activate AI optimization'
      : ''

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 3,
        py: 2,
        borderRadius: 2,
        bgcolor: visuallyActive
          ? 'rgba(168, 85, 247, 0.07)'
          : 'rgba(255,255,255,0.03)',
        border: '1px solid',
        borderColor: visuallyActive
          ? 'rgba(168, 85, 247, 0.2)'
          : 'rgba(255,255,255,0.08)',
        borderLeft: '3px solid',
        borderLeftColor: visuallyActive ? '#a855f7' : '#2a3f57',
        mb: 3,
        flexWrap: {
          xs: 'wrap',
          md: 'nowrap',
        },
        transition: 'all 0.2s ease',
        opacity: aiToggleEnabled ? 1 : 0.45,
      }}
    >
      {/* Icon + Label */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: '50%',
            bgcolor: visuallyActive
              ? 'rgba(168, 85, 247, 0.15)'
              : 'rgba(255,255,255,0.05)',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
        >
          <Bot color={visuallyActive ? '#a855f7' : '#4a6382'} size={18} />
        </Box>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: 1,
              display: 'block',
              lineHeight: 1,
            }}
          >
            AI Recommendation
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 0.5,
            }}
          >
            {(loading || isWaiting) && visuallyActive ? (
              <CircularProgress size={16} sx={{ color: '#a855f7' }} />
            ) : (
              <Typography
                variant="subtitle1"
                fontWeight="700"
                color={visuallyActive ? 'text.primary' : 'text.disabled'}
                sx={{
                  lineHeight: 1,
                }}
              >
                {aiRecommendedAmps}A
              </Typography>
            )}
            <Chip
              label={`${aiConfidence} confidence`}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                bgcolor: visuallyActive
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(255,255,255,0.04)',
                color: visuallyActive ? '#f59e0b' : '#4a6382',
                border: '1px solid',
                borderColor: visuallyActive
                  ? 'rgba(245, 158, 11, 0.2)'
                  : 'rgba(255,255,255,0.08)',
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        sx={{
          width: '1px',
          height: 36,
          bgcolor: visuallyActive
            ? 'rgba(168, 85, 247, 0.2)'
            : 'rgba(255,255,255,0.08)',
          flexShrink: 0,
          display: {
            xs: 'none',
            md: 'block',
          },
        }}
      />

      {/* Reasoning text */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexGrow: 1,
          minWidth: 0,
          opacity: visuallyActive ? 1 : 0.35,
          transition: 'opacity 0.2s ease',
        }}
      >
        <TrendingUp
          size={14}
          color={visuallyActive ? '#a855f7' : '#4a6382'}
          style={{
            flexShrink: 0,
          }}
        />
        {isError && visuallyActive && (
          <AlertTriangle
            size={14}
            color="#f59e0b"
            style={{ flexShrink: 0 }}
          />
        )}
        <Typography
          variant="body2"
          color={isError && visuallyActive ? '#f59e0b' : 'text.secondary'}
          sx={{
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          {!aiToggleEnabled
            ? `"${lockoutReason}"`
            : !autoOptimize
              ? '"Auto-optimization paused. Manual control active."'
              : (loading || isWaiting)
                ? '"Calling AI optimizer — analyzing solar and charging data..."'
                : isError
                  ? '"AI temporarily unavailable — using rule-based charging. Toggle off and on to retry."'
                  : isFallback
                    ? '"AI recommendation expired — using rule-based charging until next update."'
                    : `"${aiReasoning || 'AI is analyzing your solar and charging data...'}"`}
        </Typography>
        {visuallyActive && aiModelUsed && !isError && !isFallback && !isWaiting && !(loading) && (
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#4a6382', mt: 0.3, display: 'block' }}>
            Model: {aiModelUsed}
          </Typography>
        )}
      </Box>

      {/* Auto Optimize Toggle */}
      <Box
        sx={{
          flexShrink: 0,
          ml: {
            xs: 0,
            md: 'auto',
          },
        }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={visuallyActive}
              onChange={(e) => onAutoOptimizeChange(e.target.checked)}
              disabled={!aiToggleEnabled}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: '#a855f7',
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: '#a855f7',
                },
              }}
            />
          }
          label={
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {visuallyActive && (
                <Box
                  className="pulsing-dot"
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: '#a855f7',
                    boxShadow: '0 0 8px #a855f7',
                    flexShrink: 0,
                  }}
                />
              )}
              <Typography
                variant="body2"
                fontWeight="600"
                color={visuallyActive ? '#a855f7' : 'text.disabled'}
                sx={{
                  whiteSpace: 'nowrap',
                }}
              >
                Auto Optimize Charging with AI
              </Typography>
            </Box>
          }
          labelPlacement="start"
        />
      </Box>
    </Box>
  )
}
