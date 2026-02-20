import React from 'react'
import { Box, Typography, Chip, Switch, FormControlLabel } from '@mui/material'
import { Bot, TrendingUp } from 'lucide-react'
import type { AIConfidence } from '../types/api'

interface AIRecommendationStripProps {
  autoOptimize: boolean
  onAutoOptimizeChange: (value: boolean) => void
  aiRecommendedAmps: number
  aiConfidence: AIConfidence
  aiReasoning: string
}
export function AIRecommendationStrip({
  autoOptimize,
  onAutoOptimizeChange,
  aiRecommendedAmps,
  aiConfidence,
  aiReasoning,
}: AIRecommendationStripProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 3,
        py: 2,
        borderRadius: 2,
        bgcolor: autoOptimize
          ? 'rgba(168, 85, 247, 0.07)'
          : 'rgba(255,255,255,0.03)',
        border: '1px solid',
        borderColor: autoOptimize
          ? 'rgba(168, 85, 247, 0.2)'
          : 'rgba(255,255,255,0.08)',
        borderLeft: '3px solid',
        borderLeftColor: autoOptimize ? '#a855f7' : '#2a3f57',
        mb: 3,
        flexWrap: {
          xs: 'wrap',
          md: 'nowrap',
        },
        transition: 'all 0.2s ease',
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
            bgcolor: autoOptimize
              ? 'rgba(168, 85, 247, 0.15)'
              : 'rgba(255,255,255,0.05)',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
        >
          <Bot color={autoOptimize ? '#a855f7' : '#4a6382'} size={18} />
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
            <Typography
              variant="subtitle1"
              fontWeight="700"
              color={autoOptimize ? 'text.primary' : 'text.disabled'}
              sx={{
                lineHeight: 1,
              }}
            >
              {aiRecommendedAmps}A
            </Typography>
            <Chip
              label={`${aiConfidence} confidence`}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                bgcolor: autoOptimize
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(255,255,255,0.04)',
                color: autoOptimize ? '#f59e0b' : '#4a6382',
                border: '1px solid',
                borderColor: autoOptimize
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
          bgcolor: autoOptimize
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
          opacity: autoOptimize ? 1 : 0.35,
          transition: 'opacity 0.2s ease',
        }}
      >
        <TrendingUp
          size={14}
          color={autoOptimize ? '#a855f7' : '#4a6382'}
          style={{
            flexShrink: 0,
          }}
        />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          {autoOptimize
            ? `"${aiReasoning || 'AI is analyzing your solar and charging data...'}"`
            : '"Auto-optimization paused. Manual control active."'}
        </Typography>
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
              checked={autoOptimize}
              onChange={(e) => onAutoOptimizeChange(e.target.checked)}
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
              {autoOptimize && (
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
                color={autoOptimize ? '#a855f7' : 'text.disabled'}
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
