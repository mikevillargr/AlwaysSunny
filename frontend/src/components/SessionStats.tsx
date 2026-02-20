import React from 'react'
import { Box, Card, Typography, Grid } from '@mui/material'
import { CheckCircle, AlertCircle } from 'lucide-react'
import type { Session } from '../types/api'

interface SessionStatsProps {
  session: Session | null
  teslaSoc: number
  targetSoc: number
  teslaChargingAmps: number
  teslaChargingKw: number
  chargingStrategy: string
  departureTime: string
  mode: string
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
}: SessionStatsProps) {
  const solarPct = session?.solar_pct ?? 0
  const gridPct = 100 - solarPct
  const safeTeslaSoc = teslaSoc || 0
  const safeTargetSoc = targetSoc || 100
  const safeAmps = teslaChargingAmps || 0
  const safeKw = teslaChargingKw || 0
  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        height: '100%',
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
            Solar {Math.round(solarPct)}%
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
          Solar Subsidy
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
            · {(session?.solar_kwh ?? 0).toFixed(1)} kWh solar
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
            {safeAmps}A · {safeKw.toFixed(1)} kW
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
            {chargingStrategy === 'solar' ? 'SESSION TIME' : 'DEPARTS IN'}
          </Typography>
          <Typography variant="body1" fontWeight="600">
            {chargingStrategy === 'solar'
              ? session ? `${session.elapsed_mins}m` : '—'
              : departureTime ? departureTime : '—'}
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
            ₱{Math.round(session?.saved_pesos ?? 0).toLocaleString()}
          </Typography>
        </Grid>
      </Grid>
    </Card>
  )
}
