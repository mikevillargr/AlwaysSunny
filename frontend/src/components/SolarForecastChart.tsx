import React from 'react'
import { Card, Typography, Box } from '@mui/material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Sunrise, Sunset } from 'lucide-react'
import type { Forecast } from '../types/api'
import { formatHour12 } from '../utils/constants'

interface SolarForecastChartProps {
  forecast: Forecast
  forecastLocationSet?: boolean
}

export function SolarForecastChart({ forecast, forecastLocationSet }: SolarForecastChartProps) {
  const data = forecast.hourly.map((h) => ({
    hour: formatHour12(h.hour),
    irradiance: h.irradiance_wm2,
  }))

  const currentHour = new Date().getHours()
  const currentLabel = formatHour12(`${currentHour}:00`)
  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: 3,
        height: '100%',
      }}
      className="items-center justify-start"
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Solar Forecast — Today
        </Typography>
        {forecastLocationSet === false && (
          <Typography variant="caption" sx={{ color: '#f59e0b', fontSize: '0.6rem' }}>
            ⚠ No location set
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          height: 200,
          width: '100%',
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 0,
            }}
          >
            <XAxis
              dataKey="hour"
              tick={{
                fill: '#8da4be',
                fontSize: 10,
              }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <YAxis hide />
            <Tooltip
              cursor={{
                fill: 'rgba(255,255,255,0.05)',
              }}
              contentStyle={{
                backgroundColor: '#1e2d40',
                border: '1px solid #2a3f57',
                borderRadius: 8,
              }}
              itemStyle={{
                color: '#f5c518',
              }}
            />
            <ReferenceLine x={currentLabel} stroke="white" strokeDasharray="3 3" />
            <Bar dataKey="irradiance" fill="#f5c518" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
          align="center"
          sx={{
            mb: 1,
          }}
        >
          Peak solar:{' '}
          <span
            style={{
              color: '#f5c518',
              fontWeight: 600,
            }}
          >
            {forecast.peak_window_start ? `${formatHour12(forecast.peak_window_start)} – ${formatHour12(forecast.peak_window_end)}` : '—'}
          </span>
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            px: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Sunrise size={14} color="#8da4be" />
            <Typography variant="caption" color="text.secondary">
              {forecast.sunrise ? formatHour12(forecast.sunrise) : '—'}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Sunset size={14} color="#8da4be" />
            <Typography variant="caption" color="text.secondary">
              {forecast.sunset ? formatHour12(forecast.sunset) : '—'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Card>
  )
}
