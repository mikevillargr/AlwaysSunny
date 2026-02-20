import React from 'react'
import { Card, Box, Typography } from '@mui/material'
import { CloudSun, Sun, Zap } from 'lucide-react'
import type { Forecast } from '../types/api'

interface GridBudgetWeatherProps {
  forecast: Forecast
  solarW: number
  gridBudgetTotalKwh: number
  gridBudgetUsedKwh: number
  gridBudgetPct: number
}

export function GridBudgetWeather({ forecast, solarW, gridBudgetTotalKwh, gridBudgetUsedKwh, gridBudgetPct }: GridBudgetWeatherProps) {
  // Get current hour's data from forecast
  const currentHour = new Date().getHours()
  const hourStr = `${String(currentHour).padStart(2, '0')}:00`
  const currentHourData = forecast.hourly.find((h) => h.hour === hourStr)
  const cloudCover = currentHourData?.cloud_cover_pct ?? 0
  const irradiance = currentHourData?.irradiance_wm2 ?? 0
  return (
    <Card
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
      className="items-center justify-start"
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
        Solar Conditions
      </Typography>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Cloud Cover */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <CloudSun size={20} color="#f5c518" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                letterSpacing: 0.5,
              }}
            >
              CLOUD COVER
            </Typography>
          </Box>
          <Typography variant="h6" fontWeight="700" color="text.primary">
            {cloudCover}%
          </Typography>
        </Box>

        {/* UV Index */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Sun size={20} color="#f5c518" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                letterSpacing: 0.5,
              }}
            >
              SOLAR YIELD
            </Typography>
          </Box>
          <Typography variant="h6" fontWeight="700" color="text.primary">
            {Math.round(solarW).toLocaleString()}W
          </Typography>
        </Box>

        {/* Irradiance */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Zap size={20} color="#f5c518" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                letterSpacing: 0.5,
              }}
            >
              IRRADIANCE
            </Typography>
          </Box>
          <Typography
            variant="h6"
            fontWeight="700"
            color="text.primary"
            sx={{
              lineHeight: 1,
            }}
          >
            {irradiance}
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 400,
                color: '#8da4be',
                marginLeft: 3,
              }}
            >
              W/m²
            </span>
          </Typography>
        </Box>
      </Box>

      {/* Daily Grid Budget */}
      {gridBudgetTotalKwh > 0 && (
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: '1px solid #2a3f57',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Zap size={16} color="#3b82f6" />
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
              DAILY GRID IMPORT
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="h6" fontWeight="700" color="#3b82f6">
              {gridBudgetUsedKwh.toFixed(1)} kWh
            </Typography>
            <Typography variant="body2" color="text.secondary">
              / {gridBudgetTotalKwh} kWh budget
            </Typography>
          </Box>
          <Box
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: '#1e2d40',
              overflow: 'hidden',
              mb: 0.5,
            }}
          >
            <Box
              sx={{
                height: '100%',
                width: `${Math.min(100, gridBudgetPct)}%`,
                bgcolor: gridBudgetPct >= 90 ? '#ef4444' : gridBudgetPct >= 70 ? '#f59e0b' : '#3b82f6',
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }}
            />
          </Box>
          <Typography variant="caption" color={gridBudgetPct >= 90 ? '#ef4444' : 'text.secondary'}>
            {gridBudgetPct >= 100
              ? 'Budget exhausted — charging paused'
              : gridBudgetPct >= 90
                ? `${Math.round(gridBudgetPct)}% used — approaching limit`
                : `${Math.round(gridBudgetPct)}% of daily budget used`}
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          mt: 2,
          pt: 2,
          borderTop: '1px solid #2a3f57',
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontStyle: 'italic',
            mb: 1,
          }}
        >
          {forecast.peak_window_start
            ? `Peak solar window ${forecast.peak_window_start}–${forecast.peak_window_end}`
            : 'No solar forecast available'}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: '#4a6382',
            fontSize: '0.65rem',
          }}
        >
          Source: Open-Meteo
        </Typography>
      </Box>
    </Card>
  )
}
