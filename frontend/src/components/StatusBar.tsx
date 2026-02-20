import React from 'react'
import { Box, Typography, Chip } from '@mui/material'
import { Car } from 'lucide-react'
import type { ChargerStatus, ChargingState, Mode } from '../types/api'

interface StatusBarProps {
  mode: Mode
  chargerStatus: ChargerStatus
  chargingState: ChargingState
  chargePortConnected: boolean
  teslaSoc: number
  solaxDataAgeSecs: number
}

function getStatusDisplay(props: StatusBarProps) {
  const { chargerStatus, chargingState, chargePortConnected } = props
  if (!chargePortConnected) {
    return { label: 'Disconnected from Charger', color: '#4a6382', pulse: false }
  }
  if (chargerStatus === 'charging_away') {
    return { label: 'Charging Away from Home', color: '#f59e0b', pulse: false }
  }
  if (chargingState === 'Charging') {
    return { label: `Charging · ${props.teslaSoc}% SoC`, color: '#22c55e', pulse: true }
  }
  if (chargingState === 'Complete') {
    return { label: `Charge Complete · ${props.teslaSoc}%`, color: '#3b82f6', pulse: false }
  }
  if (chargingState === 'Stopped') {
    return { label: 'Charging Paused', color: '#f59e0b', pulse: false }
  }
  return { label: 'Connected to Charger', color: '#22c55e', pulse: false }
}

export function StatusBar(props: StatusBarProps) {
  const { label, color, pulse } = getStatusDisplay(props)
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
