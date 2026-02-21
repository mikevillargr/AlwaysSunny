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
} from '@mui/material'
import { ChevronDown, ChevronUp, Battery } from 'lucide-react'
import { apiFetch } from '../lib/api'
import type { SessionRecord } from '../types/api'

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

function SessionCard({ session }: { session: SessionRecord }) {
  const [expanded, setExpanded] = useState(false)
  const solarPct = session.solar_pct ?? 0
  const kwh = session.kwh_added ?? 0
  const solar = session.solar_kwh ?? 0
  const grid = session.grid_kwh ?? 0
  const saved = session.saved_amount ?? 0
  const isActive = !session.ended_at

  return (
    <Card
      sx={{ mb: 2, p: 2, cursor: 'pointer' }}
      onClick={() => setExpanded(!expanded)}
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
            {Math.round(saved).toLocaleString()}
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
            {Math.round(solarPct)}% Solar
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
                {session.electricity_rate?.toFixed(2) ?? '—'}/kWh
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Solar Subsidy
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
                {Math.round(saved).toLocaleString()}
              </Typography>
            </Grid>
          </Grid>
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
    { label: 'All-time saved', value: `${Math.round(totalSaved).toLocaleString()}`, color: '#22c55e' },
    { label: 'Avg solar subsidy', value: `${avgSubsidy}%`, color: '#f5c518' },
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
            <SessionCard key={session.id} session={session} />
          ))
        )}
      </Box>
    </Box>
  )
}
