import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  Chip,
  Typography,
  Grid,
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
  const startedDate = new Date(session.started_at)

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
      sx={{
        mb: 2,
        p: 2,
        cursor: 'pointer',
        ...(isActive && {
          border: '1px solid #22c55e40',
          boxShadow: '0 0 12px #22c55e15',
        }),
      }}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight="600" color="text.primary">
              {formatDate(session.started_at)}
            </Typography>
            {isActive && (
              <Chip
                label="LIVE"
                size="small"
                sx={{
                  bgcolor: '#22c55e',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  height: 20,
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 },
                  },
                }}
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {formatTime(session.started_at)}
            {isActive
              ? ' → In progress'
              : ` → ${formatTime(session.ended_at)}`}
            {' · '}
            {isActive
              ? formatDuration(Math.round((Date.now() - startedDate.getTime()) / 60000))
              : formatDuration(session.duration_mins)}
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

const PAGE_SIZE = 10

export function History() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('₱')
  const [allSessions, setAllSessions] = useState<SessionRecord[]>([])

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

  // Fetch summary stats once (all sessions, large limit)
  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiFetch('/api/sessions?limit=100&offset=0')
        if (res.ok) {
          const data = await res.json()
          const valid = (data.sessions || []).filter((s: SessionRecord) =>
            (s.kwh_added && s.kwh_added > 0) || !s.ended_at
          )
          setAllSessions(valid)
        }
      } catch { /* ignore */ }
    })()
  }, [])

  // Fetch paginated sessions
  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const offset = page * PAGE_SIZE
        const res = await apiFetch(`/api/sessions?limit=${PAGE_SIZE}&offset=${offset}`)
        if (res.ok) {
          const data = await res.json()
          const valid = (data.sessions || []).filter((s: SessionRecord) =>
            (s.kwh_added && s.kwh_added > 0) || !s.ended_at
          )
          setSessions(valid)
          setTotal(data.total || 0)
        }
      } catch (e) {
        console.warn('[History] Failed to fetch sessions:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Compute summary stats from all sessions (not just current page)
  const completed = allSessions.filter((s) => s.ended_at && s.kwh_added && s.kwh_added > 0)
  const totalSolarKwh = completed.reduce((sum, s) => sum + (s.solar_kwh ?? 0), 0)
  const totalSaved = completed.reduce((sum, s) => sum + (s.saved_amount ?? 0), 0)
  const totalKwh = completed.reduce((sum, s) => sum + (s.kwh_added ?? 0), 0)
  const avgSubsidy = totalKwh > 0 ? Math.round((totalSolarKwh / totalKwh) * 100) : 0

  const summaryStats = [
    { label: 'Total solar charged', value: `${totalSolarKwh.toFixed(0)} kWh` },
    { label: 'Total saved', value: `${currencySymbol}${Math.round(totalSaved).toLocaleString()}`, color: '#22c55e' },
    { label: 'Avg Tesla solar %', value: `${avgSubsidy}%`, color: '#f5c518' },
    { label: 'Total sessions', value: `${total}` },
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

      {/* Session List */}
      <Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : sessions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Battery size={40} color="#4a6382" />
            <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
              No sessions yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Sessions will appear here once your car starts charging at home.
            </Typography>
          </Box>
        ) : (
          <>
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} currencySymbol={currencySymbol} />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 3, mb: 2 }}>
                <Typography
                  variant="body2"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  sx={{
                    cursor: page > 0 ? 'pointer' : 'default',
                    color: page > 0 ? '#3b82f6' : '#4a6382',
                    userSelect: 'none',
                    '&:hover': page > 0 ? { textDecoration: 'underline' } : {},
                  }}
                >
                  ← Previous
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Page {page + 1} of {totalPages}
                </Typography>
                <Typography
                  variant="body2"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  sx={{
                    cursor: page < totalPages - 1 ? 'pointer' : 'default',
                    color: page < totalPages - 1 ? '#3b82f6' : '#4a6382',
                    userSelect: 'none',
                    '&:hover': page < totalPages - 1 ? { textDecoration: 'underline' } : {},
                  }}
                >
                  Next →
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
