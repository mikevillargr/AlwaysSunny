import React, { useState } from 'react'
import { Grid, Box } from '@mui/material'
import { StatusBar } from '../components/StatusBar'
import { EnergyFlowPanel } from '../components/EnergyFlowPanel'
import { SessionStats } from '../components/SessionStats'
import { SolarForecastChart } from '../components/SolarForecastChart'
import { AIRecommendationStrip } from '../components/AIRecommendationStrip'
import { GridBudgetWeather } from '../components/GridBudgetWeather'
import { ChargingControls } from '../components/ChargingControls'
import { AmperageControl } from '../components/AmperageControl'
export function Dashboard() {
  const [autoOptimize, setAutoOptimize] = useState(true)
  return (
    <Box
      sx={{
        maxWidth: 1400,
        mx: 'auto',
        p: {
          xs: 2,
          md: 3,
        },
      }}
    >
      <StatusBar />
      <AIRecommendationStrip
        autoOptimize={autoOptimize}
        onAutoOptimizeChange={setAutoOptimize}
      />
      <AmperageControl autoOptimize={autoOptimize} />
      <ChargingControls />

      <Grid container spacing={3} justifyContent="center">
        <Grid item xs={12}>
          <EnergyFlowPanel />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SessionStats />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SolarForecastChart />
        </Grid>
        <Grid item xs={12} sm={4}>
          <GridBudgetWeather />
        </Grid>
      </Grid>
    </Box>
  )
}
