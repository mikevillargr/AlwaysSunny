import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  Typography,
  Grid,
  Tabs,
  Tab,
  Collapse,
  CircularProgress,
  Divider,
} from '@mui/material'
import { ChevronDown, ChevronUp, Battery, Sun, Zap, Activity } from 'lucide-react'
import { apiFetch } from '../lib/api'
import type { SessionRecord } from '../types/api'
import { getCurrencySymbol } from '../utils/currency'

interface SessionDetails {
  session_id: number
  snapshot_count: number
  avg_solar_w?: number
  peak_solar_w?: number
  min_solar_w?: number
  avg_grid_w?: number
  avg_household_w?: number
  avg_battery_w?: number
  avg_charging_amps?: number
  peak_charging_amps?: number
  soc_start?: number
  soc_end?: number
}

function formatDuration(mins: number | null): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  } catch { return '' }
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '' }
}

function SessionCard({ session, currencySymbol }: { session: SessionRecord; currencySymbol: string }) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<SessionDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const solarPct = session.solar_pct ?? 0
  const kwh = session.kwh_added ?? 0
  const solar = session.solar_kwh ?? 0
  const grid = session.grid_kwh ?? 0
  const saved = session.saved_amount ?? 0
  const isActive = !session.ended_at

  const handleToggle = () => {
    const willExpand = !expanded
    setExpanded(willExpand)
    if (willExpand && !details && !detailsLoading) {
      setDetailsLoading(true)
      apiFetch(`/api/sessions/${session.id}/details`)
        .then(async (res) => {
          if (res.ok) setDetails(await res.json())
        })
        .catch(() => {})
        .finally(() => setDetailsLoading(false))
    }
  }

  return (
    <Card
      sx={{ mb: 2, p: 2, cursor: 'pointer' }}
      onClick={handleToggle}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight="600" color="text.primary">
            {formatDate(session.started_at)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatTime(session.started_at)}
            {isActive ? ' → In progress' : ` → ${formatTime(session.ended_at)}`}
            {' · '}
            {formatDuration(session.duration_mins)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="h6" fontWeight="700" color="#22c55e">
            {currencySymbol}{Math.round(saved).toLocaleString()}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saved
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.primary">
            Charged: {kwh.toFixed(1)} kWh
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {Math.round(solarPct)}% Solar Charged
          </Typography>
        </Box>

        {/* Progress Bar */}
        <Box
          sx={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <Box sx={{ width: `${solarPct}%`, bgcolor: '#f5c518' }} />
          <Box sx={{ flexGrow: 1, bgcolor: '#3b82f6' }} />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" color="#f5c518">
            Solar: {solar.toFixed(1)} kWh
          </Typography>
          <Typography variant="caption" color="#3b82f6">
            Grid: {grid.toFixed(1)} kWh
          </Typography>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #2a3f57' }}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                SoC Range
              </Typography>
              <Typography variant="body2" fontWeight="600" color="text.primary">
                {session.start_soc ?? '—'}% → {session.end_soc ?? (isActive ? 'charging' : '—')}%
                {session.target_soc ? ` (target ${session.target_soc}%)` : ''}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Electricity Rate
              </Typography>
              <Typography variant="body2" fontWeight="600" color="text.primary">
                {currencySymbol}{session.electricity_rate?.toFixed(2) ?? '—'}/kWh
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Tesla Solar Subsidy
              </Typography>
              <Typography variant="body2" fontWeight="600" color="#f5c518">
                {Math.round(solarPct)}%
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                {session.subsidy_calculation_method === 'exact'
                  ? 'Solar subsidy is exact — no home battery'
                  : 'Solar subsidy is estimated — includes possible home battery discharge'}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Grid Cost Avoided
              </Typography>
              <Typography variant="body2" fontWeight="600" color="#22c55e">
                {currencySymbol}{Math.round(saved).toLocaleString()}
              </Typography>
            </Grid>
          </Grid>

          {/* Enriched Session Data from Snapshots */}
          {detailsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={18} sx={{ color: '#4a6382' }} />
            </Box>
          )}
          {details && details.snapshot_count > 0 && (
            <>
              <Divider sx={{ my: 2, borderColor: '#1a2a3d' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Activity size={14} color="#a855f7" />
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Session Conditions ({details.snapshot_count} snapshots)
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Sun size={12} color="#f5c518" />
                    <Typography variant="caption" color="text.secondary">Avg Solar</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="600" color="#f5c518">
                    {details.avg_solar_w?.toLocaleString()}W
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Sun size={12} color="#f59e0b" />
                    <Typography variant="caption" color="text.secondary">Peak Solar</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="600" color="#f59e0b">
                    {details.peak_solar_w?.toLocaleString()}W
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Sun size={12} color="#6b8299" />
                    <Typography variant="caption" color="text.secondary">Min Solar</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="600" color="text.secondary">
                    {details.min_solar_w?.toLocaleString()}W
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Zap size={12} color="#3b82f6" />
                    <Typography variant="caption" color="text.secondary">Avg Grid</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="600" color="#3b82f6">
                    {details.avg_grid_w?.toLocaleString()}W
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Zap size={12} color="#8da4be" />
                    <Typography variant="caption" color="text.secondary">Avg Household</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="600" color="text.secondary">
                    {details.avg_household_w?.toLocaleString()}W
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Activity size={12} color="#22c55e" />
                    <Typography variant="caption" color="text.secondary">Avg Amps</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="600" color="#22c55e">
                    {details.avg_charging_amps}A
                    <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                      (peak {details.peak_charging_amps}A)
                    </Typography>
                  </Typography>
                </Grid>
              </Grid>
            </>
          )}
          {details && details.snapshot_count === 0 && (
            <>
              <Divider sx={{ my: 2, borderColor: '#1a2a3d' }} />
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                No energy snapshots recorded for this session.
              </Typography>
            </>
          )}
        </Box>
      </Collapse>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: -1 }}>
        {expanded ? (
          <ChevronUp size={16} color="#4a6382" />
        ) : (
          <ChevronDown size={16} color="#4a6382" />
        )}
      </Box>
    </Card>
  )
}

export function History() {
  const [tabValue, setTabValue] = useState(0)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('₱')

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await apiFetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          const code = data.currency_code || 'PHP'
          setCurrencySymbol(getCurrencySymbol(code))
        }
      } catch { /* use default */ }
    }
    fetchSettings()
  }, [])

  useEffect(() => {
    async function fetchSessions() {
      try {
        setLoading(true)
        const res = await apiFetch('/api/sessions?limit=100')
        if (res.ok) {
          const data = await res.json()
          // Filter out orphaned sessions (0 kWh, no end time, no data)
          const valid = (data.sessions || []).filter((s: SessionRecord) =>
            (s.kwh_added && s.kwh_added > 0) || !s.ended_at
          )
          setSessions(valid)
        }
      } catch (e) {
        console.warn('[History] Failed to fetch sessions:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [])

  // Filter sessions by tab
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const filtered = sessions.filter((s) => {
    if (tabValue === 2) return true // All Time
    const d = new Date(s.started_at)
    if (tabValue === 0) return d >= thisMonthStart
    if (tabValue === 1) return d >= lastMonthStart && d < thisMonthStart
    return true
  })

  // Compute summary stats from completed sessions only
  const completed = sessions.filter((s) => s.ended_at && s.kwh_added && s.kwh_added > 0)
  const totalSolarKwh = completed.reduce((sum, s) => sum + (s.solar_kwh ?? 0), 0)
  const totalSaved = completed.reduce((sum, s) => sum + (s.saved_amount ?? 0), 0)
  const totalKwh = completed.reduce((sum, s) => sum + (s.kwh_added ?? 0), 0)
  const avgSubsidy = totalKwh > 0 ? Math.round((totalSolarKwh / totalKwh) * 100) : 0
  const thisMonthCount = sessions.filter((s) => new Date(s.started_at) >= thisMonthStart).length

  const summaryStats = [
    { label: 'All-time solar charged', value: `${totalSolarKwh.toFixed(0)} kWh` },
    { label: 'All-time saved', value: `${currencySymbol}${Math.round(totalSaved).toLocaleString()}`, color: '#22c55e' },
    { label: 'Avg Tesla solar %', value: `${avgSubsidy}%`, color: '#f5c518' },
    { label: 'Sessions this month', value: `${thisMonthCount}` },
  ]

  return (
    <Box
      sx={{
        maxWidth: 1000,
        mx: 'auto',
        p: { xs: 2, md: 3 },
      }}
    >
      <Typography variant="h4" fontWeight="700" sx={{ mb: 3 }}>
        Session History
      </Typography>

      {/* Summary Stats */}
      <Grid
        container
        spacing={2}
        justifyContent="center"
        sx={{ mb: 4 }}
      >
        {summaryStats.map((stat, index) => (
          <Grid item xs={6} sm={3} md={2.5} key={index}>
            <Card sx={{ p: 2, textAlign: 'center' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: 'uppercase' }}
              >
                {stat.label}
              </Typography>
              <Typography
                variant="h5"
                fontWeight="700"
                color={stat.color || 'text.primary'}
                sx={{ mt: 1 }}
              >
                {stat.value}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="This Month" />
          <Tab label="Last Month" />
          <Tab label="All Time" />
        </Tabs>
      </Box>

      {/* Session List */}
      <Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Battery size={40} color="#4a6382" />
            <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
              No sessions yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Sessions will appear here once your car starts charging.
            </Typography>
          </Box>
        ) : (
          filtered.map((session) => (
            <SessionCard key={session.id} session={session} currencySymbol={currencySymbol} />
          ))
        )}
      </Box>
    </Box>
  )
}
