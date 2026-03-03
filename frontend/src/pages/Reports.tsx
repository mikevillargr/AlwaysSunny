import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  Typography,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { TrendingUp, Sun, Zap, Leaf, Fuel, Car, DollarSign, Info } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { getCurrencySymbol } from '../utils/currency'

interface MonthlyBreakdown {
  month: string
  total_kwh_charged: number
  total_solar_kwh: number
  total_grid_kwh: number
  solar_savings: number
  ev_vs_gas_savings: number
  ev_charging_cost: number
  total_sessions: number
}

interface ReportsSummary {
  period: string
  total_sessions: number
  total_kwh_charged: number
  total_solar_kwh: number
  total_grid_kwh: number
  avg_solar_pct: number
  solar_savings: number
  ev_charging_cost: number
  gas_equivalent_cost: number
  ev_vs_gas_savings: number
  total_savings: number
  equivalent_km_driven: number
  equivalent_liters_saved: number
  co2_avoided_kg: number
  cost_per_km_ev: number
  cost_per_km_gas: number
  currency_code: string
  electricity_rate: number
  gas_price_per_liter: number
  ice_efficiency_km_per_liter: number
  ev_efficiency_wh_per_km: number
  monthly_breakdown: MonthlyBreakdown[]
}

const PIE_COLORS = ['#f5c518', '#3b82f6']

export function Reports() {
  const [period, setPeriod] = useState<string>('all')
  const [data, setData] = useState<ReportsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('₱')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(`/api/reports/summary?period=${period}`)
        if (res.ok) {
          const d = await res.json()
          setData(d)
          setCurrencySymbol(getCurrencySymbol(d.currency_code || 'PHP'))
        }
      } catch (e) {
        console.warn('[Reports] Failed to fetch:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [period])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={40} />
      </Box>
    )
  }

  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography color="text.secondary">No data available.</Typography>
      </Box>
    )
  }

  // Bar chart data
  const barData = data.monthly_breakdown.map((m) => ({
    month: m.month,
    Solar: m.total_solar_kwh,
    Grid: m.total_grid_kwh,
  }))

  // Cumulative savings line chart
  let cumSolar = 0
  let cumEvGas = 0
  const lineData = data.monthly_breakdown.map((m) => {
    cumSolar += m.solar_savings
    cumEvGas += m.ev_vs_gas_savings
    return {
      month: m.month,
      'Solar Savings': Math.round(cumSolar),
      'EV vs Gas': Math.round(cumEvGas),
    }
  })

  // Pie chart data
  const pieData = [
    { name: 'Solar', value: Math.round(data.total_solar_kwh) },
    { name: 'Grid', value: Math.round(data.total_grid_kwh) },
  ].filter((d) => d.value > 0)

  const summaryCards = [
    {
      label: 'Total Savings',
      value: `${currencySymbol}${data.total_savings.toLocaleString()}`,
      color: '#22c55e',
      icon: <TrendingUp size={20} color="#22c55e" />,
      tooltip: 'Solar Savings + EV vs Gas Savings combined. The total you saved compared to driving a gas car and paying full grid rates.',
      hero: true,
    },
    {
      label: 'Solar Savings',
      value: `${currencySymbol}${data.solar_savings.toLocaleString()}`,
      color: '#f5c518',
      icon: <Sun size={20} color="#f5c518" />,
      tooltip: 'Electricity cost avoided by charging from solar instead of the grid.',
    },
    {
      label: 'EV vs Gas',
      value: `${currencySymbol}${data.ev_vs_gas_savings.toLocaleString()}`,
      color: '#22c55e',
      icon: <Car size={20} color="#22c55e" />,
      tooltip: 'How much cheaper EV charging was compared to buying gasoline for the same distance.',
    },
    {
      label: 'Charging Cost',
      value: `${currencySymbol}${data.ev_charging_cost.toLocaleString()}`,
      color: '#3b82f6',
      icon: <Zap size={20} color="#3b82f6" />,
      tooltip: 'Actual cost of grid electricity used for charging (excludes free solar kWh).',
    },
    {
      label: 'CO₂ Avoided',
      value: `${data.co2_avoided_kg.toLocaleString()} kg`,
      color: '#10b981',
      icon: <Leaf size={20} color="#10b981" />,
      tooltip: 'Estimated CO₂ emissions avoided by not burning gasoline (2.31 kg CO₂ per liter).',
    },
  ]

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TrendingUp size={28} color="#22c55e" />
          <Typography variant="h4" fontWeight="700">
            Reports
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => v && setPeriod(v)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: '#8da4be',
              borderColor: '#2a3f57',
              '&.Mui-selected': {
                color: '#22c55e',
                bgcolor: 'rgba(34,197,94,0.08)',
                borderColor: 'rgba(34,197,94,0.3)',
              },
            },
          }}
        >
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="year">Year</ToggleButton>
          <ToggleButton value="all">All Time</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {summaryCards.map((card, i) => (
          <Grid item xs={card.hero ? 12 : 6} sm={card.hero ? 12 : 3} key={i}>
            <Tooltip title={card.tooltip || ''} arrow placement="top">
              <Card sx={{
                p: card.hero ? 3 : 2.5,
                textAlign: 'center',
                ...(card.hero && {
                  border: '1px solid rgba(34,197,94,0.3)',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, transparent 100%)',
                }),
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  {card.icon}
                  <Info size={10} color="#4a6382" />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {card.label}
                </Typography>
                <Typography variant={card.hero ? 'h3' : 'h5'} fontWeight="700" color={card.color} sx={{ mt: 0.5 }}>
                  {card.value}
                </Typography>
              </Card>
            </Tooltip>
          </Grid>
        ))}
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Bar Chart — Monthly kWh Breakdown */}
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
              Monthly Energy Breakdown
            </Typography>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3d" />
                  <XAxis dataKey="month" tick={{ fill: '#8da4be', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8da4be', fontSize: 12 }} unit=" kWh" />
                  <ReTooltip
                    contentStyle={{ backgroundColor: '#1e2d40', border: '1px solid #2a3f57', borderRadius: 8 }}
                    labelStyle={{ color: '#8da4be' }}
                  />
                  <Legend />
                  <Bar dataKey="Solar" stackId="a" fill="#f5c518" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Grid" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <Typography color="text.disabled">No data for this period</Typography>
              </Box>
            )}
          </Card>
        </Grid>

        {/* Pie Chart — Energy Source Split */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
              Energy Source
            </Typography>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{ backgroundColor: '#1e2d40', border: '1px solid #2a3f57', borderRadius: 8 }}
                    formatter={(value: number) => [`${value} kWh`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <Typography color="text.disabled">No data</Typography>
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Line Chart — Cumulative Savings */}
      {lineData.length > 1 && (
        <Card sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
            Cumulative Savings
          </Typography>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3d" />
              <XAxis dataKey="month" tick={{ fill: '#8da4be', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8da4be', fontSize: 12 }} unit={` ${currencySymbol}`} />
              <ReTooltip
                contentStyle={{ backgroundColor: '#1e2d40', border: '1px solid #2a3f57', borderRadius: 8 }}
                labelStyle={{ color: '#8da4be' }}
                formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`]}
              />
              <Legend />
              <Line type="monotone" dataKey="Solar Savings" stroke="#f5c518" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="EV vs Gas" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Detailed Stats */}
      <Card sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
          Detailed Breakdown
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Total Charged
            </Typography>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {data.total_kwh_charged} kWh
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Solar kWh
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#f5c518">
              {data.total_solar_kwh} kWh
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Grid kWh
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#3b82f6">
              {data.total_grid_kwh} kWh
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Avg Solar %
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#f5c518">
              {data.avg_solar_pct}%
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Equivalent Distance
            </Typography>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {data.equivalent_km_driven.toLocaleString()} km
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Gas Liters Saved
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#22c55e">
              {data.equivalent_liters_saved.toLocaleString()} L
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Cost/km (EV)
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#22c55e">
              {currencySymbol}{data.cost_per_km_ev}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Cost/km (Gas)
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#ef4444">
              {currencySymbol}{data.cost_per_km_gas}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Gas Equivalent Cost
            </Typography>
            <Typography variant="h6" fontWeight="600" color="#ef4444">
              {currencySymbol}{data.gas_equivalent_cost.toLocaleString()}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Sessions
            </Typography>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {data.total_sessions}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Electricity Rate
            </Typography>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {currencySymbol}{data.electricity_rate}/kWh
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Gas Price
            </Typography>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {currencySymbol}{data.gas_price_per_liter}/L
            </Typography>
          </Grid>
        </Grid>
      </Card>
    </Box>
  )
}
