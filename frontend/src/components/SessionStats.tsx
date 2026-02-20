import React from 'react'
import { Box, Card, Typography, Grid } from '@mui/material'
import { CheckCircle, AlertCircle } from 'lucide-react'
export function SessionStats() {
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
            58%
          </Typography>
          <Typography variant="body1" color="text.secondary">
            → 80% target
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
              width: '58%',
              bgcolor: '#3b82f6',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '49%',
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
            Solar 85%
          </Typography>
          <Typography variant="caption" color="#3b82f6" fontWeight="600">
            Grid 15%
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
            85%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            · 7.1 kWh solar
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
        <CheckCircle
          size={18}
          color="#22c55e"
          style={{
            marginTop: 2,
          }}
        />
        <Box>
          <Typography variant="body2" fontWeight="600" color="text.primary">
            On track for 7:00 AM departure
          </Typography>
          <Typography variant="caption" color="text.secondary">
            80% target reached in ~3h 20m at current rate
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
            12A · 2.9 kW
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
            DEPARTS IN
          </Typography>
          <Typography variant="body1" fontWeight="600">
            21h 8m
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
            8.4 kWh
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
            ₱710
          </Typography>
        </Grid>
      </Grid>
    </Card>
  )
}
