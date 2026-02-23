import React from 'react'
import { Box, Typography, Chip, Switch, useMediaQuery, useTheme } from '@mui/material'
import { Car, Power, Brain } from 'lucide-react'
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
  ollamaHealthy: boolean
  autoOptimize: boolean
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
  const tessieLabelShort = props.tessieEnabled ? 'Tessie' : 'Tessie Off'
  const aiColor = !props.autoOptimize ? '#4a6382' : props.ollamaHealthy ? '#22c55e' : '#ef4444'
  const aiLabel = !props.autoOptimize ? 'AI Off' : props.ollamaHealthy ? 'AI Online' : 'AI Offline'

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  // Short charger label for mobile
  const chargerLabelShort = (() => {
    if (!props.chargePortConnected) return 'Unplugged'
    if (props.chargingState === 'Charging') return `Charging · ${props.teslaSoc}%`
    if (props.chargingState === 'Complete') return `Done · ${props.teslaSoc}%`
    if (props.chargingState === 'Stopped') return 'Paused'
    return 'Plugged In'
  })()

  const chipHeight = isMobile ? 26 : 32
  const iconSize = isMobile ? 12 : 14
  const dotSize = isMobile ? 5 : 7
  const fontSize = isMobile ? '0.7rem' : undefined

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: { xs: 'center', sm: 'flex-end' },
        alignItems: 'center',
        width: '100%',
        mb: { xs: 2, sm: 3 },
        flexWrap: 'wrap',
        gap: { xs: 0.75, sm: 1.5 },
      }}
    >
      {/* AI Service Status */}
      <Chip
        icon={
          <Brain
            size={iconSize}
            color={aiColor}
            style={{ marginLeft: isMobile ? 6 : 8 }}
          />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                bgcolor: aiColor,
                boxShadow: props.ollamaHealthy && props.autoOptimize ? `0 0 8px ${aiColor}` : 'none',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" fontWeight="600" sx={{ letterSpacing: 0.5, fontSize }}>
              {aiLabel}
            </Typography>
          </Box>
        }
        sx={{
          bgcolor: `${aiColor}1a`,
          border: '1px solid',
          borderColor: `${aiColor}4d`,
          color: aiColor,
          height: chipHeight,
          px: isMobile ? 0.5 : 1,
          mr: { xs: 0, sm: 'auto' },
        }}
      />

      {/* Tessie Connection Kill Switch */}
      <Chip
        icon={
          <Power
            size={iconSize}
            color={tessieColor}
            style={{ marginLeft: isMobile ? 6 : 8 }}
          />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                bgcolor: tessieColor,
                boxShadow: props.tessieEnabled ? `0 0 8px ${tessieColor}` : 'none',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" fontWeight="600" sx={{ letterSpacing: 0.5, fontSize }}>
              {isMobile ? tessieLabelShort : tessieLabel}
            </Typography>
            <Switch
              size="small"
              checked={props.tessieEnabled}
              onChange={(_, checked) => props.onTessieToggle(checked)}
              sx={{
                ml: 0,
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
          height: isMobile ? 28 : 36,
          px: isMobile ? 0.5 : 1,
        }}
      />

      {/* Tesla Charging Status */}
      <Chip
        icon={
          <Car
            size={iconSize}
            color={color}
            style={{
              marginLeft: isMobile ? 6 : 8,
            }}
          />
        }
        label={
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <Box
              className={pulse ? 'pulsing-dot' : undefined}
              sx={{
                width: dotSize,
                height: dotSize,
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
                fontSize,
              }}
            >
              {isMobile ? chargerLabelShort : label}
            </Typography>
          </Box>
        }
        sx={{
          bgcolor: `${color}1a`,
          border: '1px solid',
          borderColor: `${color}4d`,
          color,
          height: chipHeight,
          px: isMobile ? 0.5 : 1,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      />
    </Box>
  )
}
