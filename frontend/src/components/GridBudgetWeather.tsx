import React from 'react'
import { Card, Box, Typography } from '@mui/material'
import { CloudSun, Thermometer, Zap } from 'lucide-react'
import type { Forecast } from '../types/api'

interface GridBudgetWeatherProps {
  forecast: Forecast
}

export function GridBudgetWeather({ forecast }: GridBudgetWeatherProps) {
  // Get current hour's data from forecast
  const currentHour = new Date().getHours()
  const hourStr = `${String(currentHour).padStart(2, '0')}:00`
  const currentHourData = forecast.hourly.find((h) => h.hour === hourStr)
  const cloudCover = currentHourData?.cloud_cover_pct ?? 0
  const irradiance = currentHourData?.irradiance_wm2 ?? 0
  const temperature = currentHourData?.temperature_c ?? 0
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

        {/* Temperature */}
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
            <Thermometer size={20} color="#f5c518" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                letterSpacing: 0.5,
              }}
            >
              TEMPERATURE
            </Typography>
          </Box>
          <Typography variant="h6" fontWeight="700" color="text.primary">
            {Math.round(temperature)}°C
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
