import React from 'react'
import { Box, Typography, Chip, Tooltip } from '@mui/material'
import { Car, MapPin, HelpCircle } from 'lucide-react'
import type { ChargerStatus } from '../types/api'

interface ChargerConnectionPillProps {
  chargerStatus: ChargerStatus
}

const pillConfig: Record<
  ChargerStatus,
  {
    label: string
    color: string
    icon: React.ReactNode
    pulse: boolean
    tooltip: string | null
  }
> = {
  charging_at_home: {
    label: 'Charging at Home',
    color: '#22c55e',
    icon: <Car size={14} />,
    pulse: true,
    tooltip: null,
  },
  charging_away: {
    label: 'Charging Away — Optimization Paused',
    color: '#f59e0b',
    icon: <MapPin size={14} />,
    pulse: false,
    tooltip:
      'Tesla is not on your home solar circuit. Optimization is paused.',
  },
  location_unknown: {
    label: 'Location Unknown — Optimization Paused',
    color: '#f59e0b',
    icon: <HelpCircle size={14} />,
    pulse: false,
    tooltip:
      'Unable to confirm Tesla location. Check Tessie connection or set your home location in Settings.',
  },
  not_connected: {
    label: 'Not Connected',
    color: '#4a6382',
    icon: <Car size={14} />,
    pulse: false,
    tooltip: null,
  },
}

export function ChargerConnectionPill({
  chargerStatus,
}: ChargerConnectionPillProps) {
  const config = pillConfig[chargerStatus]

  const chip = (
    <Chip
      icon={
        <Box
          component="span"
          sx={{
            display: 'flex',
            alignItems: 'center',
            ml: 1,
            color: config.color,
          }}
        >
          {config.icon}
        </Box>
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
            className={config.pulse ? 'pulsing-dot' : undefined}
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: config.color,
              boxShadow: config.pulse ? `0 0 8px ${config.color}` : 'none',
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
            {config.label}
          </Typography>
        </Box>
      }
      sx={{
        bgcolor: `${config.color}1a`,
        border: '1px solid',
        borderColor: `${config.color}4d`,
        color: config.color,
        height: 32,
        px: 1,
        transition: 'all 0.2s ease',
      }}
    />
  )

  if (config.tooltip) {
    return (
      <Box sx={{ mb: 2 }}>
        <Tooltip title={config.tooltip} placement="bottom" arrow>
          {chip}
        </Tooltip>
      </Box>
    )
  }

  return <Box sx={{ mb: 2 }}>{chip}</Box>
}
