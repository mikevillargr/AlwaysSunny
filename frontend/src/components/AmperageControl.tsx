import React, { useState, useEffect, useRef } from 'react'
import { Card, Box, Typography, Slider, Tooltip } from '@mui/material'
import { Car, Bot } from 'lucide-react'
import { apiFetch } from '../lib/api'

interface AmperageControlProps {
  autoOptimize: boolean
  teslaChargingAmps: number
  teslaChargingKw: number
  tessieEnabled?: boolean
  chargePortConnected?: boolean
}

export function AmperageControl({
  autoOptimize,
  teslaChargingAmps,
  teslaChargingKw,
  tessieEnabled = true,
  chargePortConnected = false,
}: AmperageControlProps) {
  const controlsEnabled = tessieEnabled && chargePortConnected
  const disabled = !controlsEnabled || autoOptimize
  const [localAmps, setLocalAmps] = useState<number>(teslaChargingAmps)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from live data when not dragging
  useEffect(() => {
    setLocalAmps(teslaChargingAmps)
  }, [teslaChargingAmps])

  const handleSliderChange = (_: unknown, val: number | number[]) => {
    setLocalAmps(val as number)
  }

  const handleSliderCommit = (_: unknown, val: number | number[]) => {
    const amps = val as number
    setLocalAmps(amps)
    // Send command immediately on slider release
    ;(async () => {
      try {
        await apiFetch('/api/override/amps', {
          method: 'POST',
          body: JSON.stringify({ amps }),
        })
      } catch (e) {
        console.warn('[AmperageControl] Failed to set amps:', e)
      }
    })()
  }

  const teslaAmperage = localAmps
  return (
    <Card
      sx={{
        p: 2.5,
        mb: 3,
        border: !controlsEnabled
          ? '1px solid #2a3f57'
          : autoOptimize
            ? '1px solid rgba(168, 85, 247, 0.25)'
            : '1px solid #22c55e',
        boxShadow: !controlsEnabled
          ? 'none'
          : autoOptimize
            ? '0 4px 20px rgba(168, 85, 247, 0.1)'
            : '0 4px 20px rgba(34, 197, 94, 0.15)',
        opacity: controlsEnabled ? 1 : 0.45,
        transition: 'all 0.2s ease',
        pointerEvents: controlsEnabled ? 'auto' : 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* Left side - Label, Value, Caption */}
        <Box
          sx={{
            flexShrink: 0,
            minWidth: 180,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 0.5,
            }}
          >
            <Car size={18} color={disabled ? '#4a6382' : '#22c55e'} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Charging Amperage
            </Typography>
            {autoOptimize && (
              <Tooltip title="AI is controlling amperage" placement="top">
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    ml: 1,
                    px: 1,
                    py: 0.25,
                    borderRadius: '10px',
                    bgcolor: 'rgba(168,85,247,0.1)',
                    border: '1px solid rgba(168,85,247,0.25)',
                  }}
                >
                  <Bot size={10} color="#a855f7" />
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.6rem',
                      color: '#a855f7',
                      fontWeight: 600,
                    }}
                  >
                    AI
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
          <Typography
            variant="h4"
            fontWeight="700"
            color={disabled ? '#4a6382' : '#22c55e'}
            sx={{
              lineHeight: 1.2,
              transition: 'color 0.2s ease',
            }}
          >
            {teslaAmperage}A
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              mt: 0.25,
            }}
          >
            {!tessieEnabled
              ? 'Tessie disconnected'
              : autoOptimize
                ? 'Managed by AI optimizer'
                : `${teslaAmperage * 230}W charging rate`}
          </Typography>
        </Box>

        {/* Right side - Slider */}
        <Box
          sx={{
            flex: 1,
            pl: 3,
          }}
        >
          <Slider
            value={teslaAmperage}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderCommit}
            min={0}
            max={32}
            step={1}
            valueLabelDisplay="auto"
            disabled={disabled}
            sx={{
              color: disabled ? '#2a3f57' : '#22c55e',
              opacity: disabled ? 0.4 : 1,
              transition: 'all 0.2s ease',
              '& .MuiSlider-thumb': {
                width: 20,
                height: 20,
                boxShadow: autoOptimize
                  ? 'none'
                  : disabled ? 'none' : '0 0 0 8px rgba(34, 197, 94, 0.16)',
              },
              '& .MuiSlider-rail': {
                opacity: 0.3,
                height: 6,
              },
              '& .MuiSlider-track': {
                height: 6,
              },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mt: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              0A
            </Typography>
            <Typography variant="caption" color="text.secondary">
              32A
            </Typography>
          </Box>
        </Box>
      </Box>
    </Card>
  )
}
