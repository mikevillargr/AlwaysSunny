import React, { useState, useCallback } from 'react'
import { Grid, Box } from '@mui/material'
import { StatusBar } from '../components/StatusBar'
import { EnergyFlowPanel } from '../components/EnergyFlowPanel'
import { SessionStats } from '../components/SessionStats'
import { SolarForecastChart } from '../components/SolarForecastChart'
import { AIRecommendationStrip } from '../components/AIRecommendationStrip'
import { GridBudgetWeather } from '../components/GridBudgetWeather'
import { ChargingControls } from '../components/ChargingControls'
import { AmperageControl } from '../components/AmperageControl'
import { useStatus } from '../hooks/useStatus'
import { apiFetch } from '../lib/api'

export function Dashboard() {
  const { status } = useStatus()
  const [autoOptimize, setAutoOptimize] = useState(status.ai_enabled)

  const handleAutoOptimizeChange = useCallback(async (value: boolean) => {
    setAutoOptimize(value)
    try {
      await apiFetch('/api/optimize/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: value }),
      })
    } catch (e) {
      console.warn('[Dashboard] Failed to toggle AI:', e)
      setAutoOptimize(!value)
    }
  }, [])

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
      <StatusBar
        mode={status.mode}
        chargerStatus={status.charger_status}
        chargingState={status.charging_state}
        chargePortConnected={status.charge_port_connected}
        teslaSoc={status.tesla_soc}
        solaxDataAgeSecs={status.solax_data_age_secs}
      />
      <AIRecommendationStrip
        autoOptimize={autoOptimize}
        onAutoOptimizeChange={handleAutoOptimizeChange}
        aiRecommendedAmps={status.ai_recommended_amps}
        aiConfidence={status.ai_confidence}
        aiReasoning={status.ai_reasoning}
      />
      <AmperageControl
        autoOptimize={autoOptimize}
        teslaChargingAmps={status.tesla_charging_amps}
        teslaChargingKw={status.tesla_charging_kw}
      />
      <ChargingControls
        teslaSoc={status.tesla_soc}
        gridImportW={status.grid_import_w}
        gridBudgetTotalKwh={status.grid_budget_total_kwh}
        gridBudgetUsedKwh={status.grid_budget_used_kwh}
        gridBudgetPct={status.grid_budget_pct}
      />

      <Grid container spacing={3} justifyContent="center">
        <Grid item xs={12}>
          <EnergyFlowPanel
            solarW={status.solar_w}
            householdDemandW={status.household_demand_w}
            gridImportW={status.grid_import_w}
            teslaChargingAmps={status.tesla_charging_amps}
            teslaChargingKw={status.tesla_charging_kw}
            chargingState={status.charging_state}
            chargePortConnected={status.charge_port_connected}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SessionStats
            session={status.session}
            teslaSoc={status.tesla_soc}
            targetSoc={80}
            teslaChargingAmps={status.tesla_charging_amps}
            teslaChargingKw={status.tesla_charging_kw}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SolarForecastChart forecast={status.forecast} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <GridBudgetWeather
            forecast={status.forecast}
            solarW={status.solar_w}
          />
        </Grid>
      </Grid>
    </Box>
  )
}
