import React, { useState } from 'react'
import { Box, Typography, Chip, useTheme } from '@mui/material'
import { Car } from 'lucide-react'
type TeslaStatus = 'connected' | 'disconnected' | 'paused'
const statusConfig: Record<
  TeslaStatus,
  {
    label: string
    color: string
    pulse: boolean
  }
> = {
  connected: {
    label: 'Connected to Charger',
    color: '#22c55e',
    pulse: true,
  },
  disconnected: {
    label: 'Disconnected from Charger',
    color: '#4a6382',
    pulse: false,
  },
  paused: {
    label: 'Charging Paused',
    color: '#f59e0b',
    pulse: false,
  },
}
const cycleStatus: Record<TeslaStatus, TeslaStatus> = {
  connected: 'paused',
  paused: 'disconnected',
  disconnected: 'connected',
}
export function StatusBar() {
  const theme = useTheme()
  const [teslaStatus, setTeslaStatus] = useState<TeslaStatus>('connected')
  const { label, color, pulse } = statusConfig[teslaStatus]
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        mb: 3,
        flexWrap: 'wrap',
        gap: 2,
      }}
    >
      {/* Tesla Connection Status */}
      <Chip
        icon={
          <Car
            size={14}
            color={color}
            style={{
              marginLeft: 8,
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
            <Box
              className={pulse ? 'pulsing-dot' : undefined}
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: color,
                boxShadow: pulse ? `0 0 8px ${color}` : 'none',
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            />
            <Typography
              variant="body2"
              fontWeight="600"
              sx={{
                letterSpacing: 0.5,
              }}
            >
              {label}
            </Typography>
          </Box>
        }
        onClick={() => setTeslaStatus((s) => cycleStatus[s])}
        sx={{
          bgcolor: `${color}1a`,
          border: '1px solid',
          borderColor: `${color}4d`,
          color,
          height: 32,
          px: 1,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      />
    </Box>
  )
}
