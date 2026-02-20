import React from 'react'
import { Box, Typography, Chip, Switch } from '@mui/material'
import { Car, Power } from 'lucide-react'
import type { ChargerStatus, ChargingState, Mode } from '../types/api'

interface StatusBarProps {
  mode: Mode
  chargerStatus: ChargerStatus
  chargingState: ChargingState
  chargePortConnected: boolean
  teslaSoc: number
  solaxDataAgeSecs: number
  tessieEnabled: boolean
  onTessieToggle: (enabled: boolean) => void
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
  const tessieColor = props.tessieEnabled ? '#22c55e' : '#ef4444'
  const tessieLabel = props.tessieEnabled ? 'Tessie Connected' : 'Tessie Disconnected'

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
      {/* Tessie Connection Kill Switch */}
      <Chip
        icon={
          <Power
            size={14}
            color={tessieColor}
            style={{ marginLeft: 8 }}
          />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: tessieColor,
                boxShadow: props.tessieEnabled ? `0 0 8px ${tessieColor}` : 'none',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" fontWeight="600" sx={{ letterSpacing: 0.5 }}>
              {tessieLabel}
            </Typography>
            <Switch
              size="small"
              checked={props.tessieEnabled}
              onChange={(_, checked) => props.onTessieToggle(checked)}
              sx={{
                ml: 0.5,
                '& .MuiSwitch-switchBase.Mui-checked': { color: '#22c55e' },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#22c55e' },
              }}
            />
          </Box>
        }
        sx={{
          bgcolor: `${tessieColor}1a`,
          border: '1px solid',
          borderColor: `${tessieColor}4d`,
          color: tessieColor,
          height: 36,
          px: 1,
        }}
      />

      {/* Tesla Charging Status */}
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
