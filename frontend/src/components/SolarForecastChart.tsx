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
const data = [
  {
    hour: '5am',
    irradiance: 0,
  },
  {
    hour: '6am',
    irradiance: 80,
  },
  {
    hour: '7am',
    irradiance: 220,
  },
  {
    hour: '8am',
    irradiance: 420,
  },
  {
    hour: '9am',
    irradiance: 580,
  },
  {
    hour: '10am',
    irradiance: 750,
  },
  {
    hour: '11am',
    irradiance: 880,
  },
  {
    hour: '12pm',
    irradiance: 920,
  },
  {
    hour: '1pm',
    irradiance: 890,
  },
  {
    hour: '2pm',
    irradiance: 760,
  },
  {
    hour: '3pm',
    irradiance: 560,
  },
  {
    hour: '4pm',
    irradiance: 340,
  },
  {
    hour: '5pm',
    irradiance: 150,
  },
  {
    hour: '6pm',
    irradiance: 40,
  },
  {
    hour: '7pm',
    irradiance: 0,
  },
]
export function SolarForecastChart() {
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
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: 1,
          mb: 2,
        }}
      >
        Solar Forecast — Today
      </Typography>

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
            <ReferenceLine x="10am" stroke="white" strokeDasharray="3 3" />
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
            10am – 2pm
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
              5:52am
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
              6:41pm
            </Typography>
          </Box>
        </Box>
      </Box>
    </Card>
  )
}
