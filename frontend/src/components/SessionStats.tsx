import React from 'react'
import { Box, Card, Typography, Grid } from '@mui/material'
import { CheckCircle, AlertCircle, PlugZap } from 'lucide-react'
import type { Session } from '../types/api'
import { formatHour12 } from '../utils/constants'
import { getCurrencySymbol } from '../utils/currency'

interface SessionStatsProps {
  session: Session | null
  teslaSoc: number
  targetSoc: number
  teslaChargingAmps: number
  teslaChargingKw: number
  chargingStrategy: string
  departureTime: string
  mode: string
  tessieEnabled?: boolean
  chargePortConnected?: boolean
  minutesToFullCharge?: number
  currencyCode?: string
  liveTeslaSolarPct?: number
  solarToTeslaW?: number
  loading?: boolean
}

export function SessionStats({
  session,
  teslaSoc,
  targetSoc,
  teslaChargingAmps,
  teslaChargingKw,
  chargingStrategy,
  departureTime,
  mode,
  tessieEnabled = true,
  chargePortConnected = false,
  minutesToFullCharge = 0,
  currencyCode = 'PHP',
  liveTeslaSolarPct = 0,
  solarToTeslaW = 0,
  loading = false,
}: SessionStatsProps) {
  // Use session accumulated solar_pct if available, otherwise use live proportional value
  const sessionSolarPct = session?.solar_pct ?? 0
  const solarPct = sessionSolarPct > 0 ? sessionSolarPct : liveTeslaSolarPct
  const gridPct = 100 - solarPct
  const safeTeslaSoc = teslaSoc || 0
  const safeTargetSoc = targetSoc || 100
  const safeAmps = teslaChargingAmps || 0
  const safeKw = teslaChargingKw || 0
  const dimmed = !tessieEnabled
  const isCharging = chargePortConnected && session != null

  if (loading || (!isCharging && !session)) {
    return (
      <Card
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          height: '100%',
          opacity: dimmed ? 0.45 : 0.6,
          transition: 'opacity 0.2s ease',
          minHeight: 320,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.04)',
            mb: 2,
          }}
        >
          <PlugZap size={28} color="#4a6382" />
        </Box>
        <Typography
          variant="body1"
          fontWeight="600"
          color="text.secondary"
          sx={{ mb: 0.5 }}
        >
          Not Charging
        </Typography>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ textAlign: 'center', maxWidth: 200 }}
        >
          {!tessieEnabled
            ? 'Tessie connection is disabled'
            : !chargePortConnected
              ? 'Plug in your Tesla to start a charging session'
              : 'Waiting for charging session to begin'}
        </Typography>
      </Card>
    )
  }

  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        height: '100%',
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: 1,
          mb: 2,
        }}
      >
        Active Session
      </Typography>


      {/* SoC Display */}
      <Box
        sx={{
          mb: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 1.5,
            mb: 1.5,
          }}
        >
          <Typography variant="h3" fontWeight="700" color="#f5c518">
            {safeTeslaSoc}%
          </Typography>
          <Typography variant="body1" color="text.secondary">
            → {safeTargetSoc}% target
          </Typography>
          {minutesToFullCharge > 0 && safeTeslaSoc < safeTargetSoc && (
            <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
              · {minutesToFullCharge >= 60
                ? `${Math.floor(minutesToFullCharge / 60)}h ${minutesToFullCharge % 60}m`
                : `${minutesToFullCharge}m`} remaining
            </Typography>
          )}
        </Box>

        {/* Custom Progress Bar */}
        <Box
          sx={{
            position: 'relative',
            height: 12,
            borderRadius: 6,
            bgcolor: '#1e2d40',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${Math.min(100, safeTeslaSoc)}%`,
              bgcolor: '#3b82f6',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${Math.min(100, safeTeslaSoc) * (solarPct / 100)}%`,
              bgcolor: '#f5c518',
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mt: 1,
          }}
        >
          <Typography variant="caption" color="#f5c518" fontWeight="600">
            Solar Charged {Math.round(solarPct)}%
          </Typography>
          <Typography variant="caption" color="#3b82f6" fontWeight="600">
            Grid {Math.round(gridPct)}%
          </Typography>
        </Box>
      </Box>

      {/* Solar Subsidy Hero */}
      <Box
        sx={{
          mb: 2,
          p: 2,
          borderRadius: 2,
          bgcolor: 'rgba(245, 197, 24, 0.06)',
          border: '1px solid rgba(245, 197, 24, 0.15)',
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: 1,
            display: 'block',
            mb: 0.5,
          }}
        >
          Tesla Solar Subsidy
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 1,
          }}
        >
          <Typography variant="h4" fontWeight="700" color="#f5c518">
            {Math.round(solarPct)}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            · {(session?.solar_kwh ?? 0).toFixed(1)} kWh from solar
          </Typography>
        </Box>
      </Box>

      {/* On Track Status */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          mb: 2,
          p: 2,
          borderRadius: 2,
          bgcolor: 'rgba(34, 197, 94, 0.06)',
          border: '1px solid rgba(34, 197, 94, 0.15)',
        }}
      >
        {safeTeslaSoc >= safeTargetSoc ? (
          <CheckCircle size={18} color="#22c55e" style={{ marginTop: 2 }} />
        ) : mode.includes('Urgent') || mode.includes('Passed') ? (
          <AlertCircle size={18} color="#f59e0b" style={{ marginTop: 2 }} />
        ) : (
          <CheckCircle size={18} color="#22c55e" style={{ marginTop: 2 }} />
        )}
        <Box>
          <Typography variant="body2" fontWeight="600" color="text.primary">
            {safeTeslaSoc >= safeTargetSoc
              ? 'Target SoC reached!'
              : mode.includes('Waiting')
                ? 'Waiting for solar surplus'
                : mode.includes('Urgent')
                  ? 'May not reach target by departure'
                  : mode.includes('Passed')
                    ? 'Departure passed — charging at max'
                    : chargingStrategy === 'solar'
                      ? 'Maximizing solar efficiency'
                      : 'Charging in progress'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {safeTeslaSoc >= safeTargetSoc
              ? `${safeTargetSoc}% target reached`
              : `${safeTargetSoc - safeTeslaSoc}% remaining to ${safeTargetSoc}% target`}
          </Typography>
        </Box>
      </Box>

      {/* Metrics Grid */}
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{
              mb: 0.5,
            }}
          >
            CHARGING AT
          </Typography>
          <Typography variant="body1" fontWeight="600">
            {Math.round(safeKw * 1000)}W · {safeAmps}A
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{
              mb: 0.5,
            }}
          >
            {minutesToFullCharge > 0 && safeTeslaSoc < safeTargetSoc ? 'ETA TO TARGET' : chargingStrategy === 'solar' ? 'SESSION TIME' : 'DEPARTS IN'}
          </Typography>
          <Typography variant="body1" fontWeight="600">
            {minutesToFullCharge > 0 && safeTeslaSoc < safeTargetSoc
              ? minutesToFullCharge >= 60
                ? `${Math.floor(minutesToFullCharge / 60)}h ${minutesToFullCharge % 60}m`
                : `${minutesToFullCharge}m`
              : chargingStrategy === 'solar'
                ? session ? `${session.elapsed_mins}m` : '—'
                : departureTime ? formatHour12(departureTime) : '—'}
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{
              mb: 0.5,
            }}
          >
            ADDED
          </Typography>
          <Typography variant="body1" fontWeight="600">
            {(session?.kwh_added ?? 0).toFixed(1)} kWh
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{
              mb: 0.5,
            }}
          >
            SAVED
          </Typography>
          <Typography variant="body1" fontWeight="700" color="#22c55e">
            {getCurrencySymbol(currencyCode)}{Math.round(session?.saved_amount ?? 0).toLocaleString()}
          </Typography>
        </Grid>
      </Grid>
    </Card>
  )
}
