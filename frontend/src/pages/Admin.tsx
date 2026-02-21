import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Grid,
  Select,
  MenuItem,
  InputAdornment,
  Chip,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Bot, Play, Shuffle, Sun, Cloud, Car, Wallet, Save, AlertTriangle, FileText, Edit3, Zap } from 'lucide-react'
import { apiFetch } from '../lib/api'

// --- Types ---
interface AISettings {
  ai_model: string
  ai_fallback_model: string
  ai_temperature: string
  ai_max_tokens: string
  ai_min_solar_surplus_w: string
  ai_min_amps: string
  ai_max_amps: string
  ai_call_interval_secs: string
  ai_stale_threshold_secs: string
  ai_retry_attempts: string
  ai_prompt_style: string
}

interface TestResult {
  pipeline: {
    '1_prompt_sent': string
    '2_ollama_raw_response': string
    '3_parsed_recommendation': {
      recommended_amps: number
      reasoning: string
      confidence: string
    }
    '4_tessie_command': {
      action: string
      amps: number
      endpoint: string
      note: string
    }
    '5_user_facing_message': {
      banner_text: string
      confidence_badge: string
      mode: string
      recommended_amps_display: string
    }
  }
  timing: {
    ollama_response_secs: number
    model: string
    host: string
  }
}

interface HistoryItem {
  time: string
  amps: number
  confidence: string
  reasoning: string
  solar: number
  soc: string
  responseSecs: number
}

// --- Defaults ---
const defaultInputs = {
  solar_w: 2800,
  household_w: 900,
  grid_import_w: 150,
  battery_soc: 65,
  battery_w: -200,
  solar_trend: 'rising',
  tesla_soc: 55,
  target_soc: 80,
  current_amps: 10,
  charging_strategy: 'solar',
  departure_time: '',
  grid_budget_total_kwh: 25,
  grid_budget_used_kwh: 5,
  max_grid_import_w: 7000,
  hours_until_sunset: 5.5,
  session_elapsed_mins: 45,
  session_kwh_added: 3.2,
  session_solar_pct: 82,
  current_time: '13:00',
  has_home_battery: true,
  has_net_metering: false,
  panel_capacity_w: 0,
  estimated_available_w: 0,
  forecasted_irradiance_wm2: 0,
  efficiency_coeff: 0,
}

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min))
const randF = (min: number, max: number, dec = 1) =>
  parseFloat((min + Math.random() * (max - min)).toFixed(dec))

const presets = {
  peakSolar: {
    solar_w: 4200, household_w: 750, grid_import_w: -300, battery_soc: 80,
    battery_w: -400, solar_trend: 'rising', tesla_soc: 45, target_soc: 80,
    current_amps: 12, charging_strategy: 'solar', departure_time: '',
    grid_budget_total_kwh: 25, grid_budget_used_kwh: 2, max_grid_import_w: 7000,
    hours_until_sunset: 6, session_elapsed_mins: 30, session_kwh_added: 2.5,
    session_solar_pct: 95, current_time: '11:00',
    has_home_battery: true, has_net_metering: false, panel_capacity_w: 0,
    estimated_available_w: 0, forecasted_irradiance_wm2: 0, efficiency_coeff: 0,
  },
  lowSolar: {
    solar_w: 350, household_w: 900, grid_import_w: 600, battery_soc: 40,
    battery_w: 200, solar_trend: 'falling', tesla_soc: 62, target_soc: 80,
    current_amps: 8, charging_strategy: 'solar', departure_time: '',
    grid_budget_total_kwh: 25, grid_budget_used_kwh: 12, max_grid_import_w: 7000,
    hours_until_sunset: 2, session_elapsed_mins: 90, session_kwh_added: 6.1,
    session_solar_pct: 55, current_time: '16:00',
    has_home_battery: true, has_net_metering: false, panel_capacity_w: 0,
    estimated_available_w: 0, forecasted_irradiance_wm2: 0, efficiency_coeff: 0,
  },
  departure: {
    solar_w: 1200, household_w: 800, grid_import_w: 400, battery_soc: 55,
    battery_w: 0, solar_trend: 'falling', tesla_soc: 52, target_soc: 90,
    current_amps: 10, charging_strategy: 'departure', departure_time: '07:00',
    grid_budget_total_kwh: 25, grid_budget_used_kwh: 8, max_grid_import_w: 7000,
    hours_until_sunset: 1.5, session_elapsed_mins: 120, session_kwh_added: 8.5,
    session_solar_pct: 60, current_time: '02:30',
    has_home_battery: true, has_net_metering: false, panel_capacity_w: 0,
    estimated_available_w: 0, forecasted_irradiance_wm2: 0, efficiency_coeff: 0,
  },
  budgetCrunch: {
    solar_w: 1800, household_w: 1000, grid_import_w: 500, battery_soc: 50,
    battery_w: 100, solar_trend: 'stable', tesla_soc: 58, target_soc: 80,
    current_amps: 14, charging_strategy: 'solar', departure_time: '',
    grid_budget_total_kwh: 10, grid_budget_used_kwh: 9.2, max_grid_import_w: 4000,
    hours_until_sunset: 4, session_elapsed_mins: 60, session_kwh_added: 5.0,
    session_solar_pct: 70, current_time: '14:00',
    has_home_battery: true, has_net_metering: false, panel_capacity_w: 0,
    estimated_available_w: 0, forecasted_irradiance_wm2: 0, efficiency_coeff: 0,
  },
  noBattery: {
    solar_w: 800, household_w: 600, grid_import_w: 100, battery_soc: 0,
    battery_w: 0, solar_trend: 'stable', tesla_soc: 50, target_soc: 80,
    current_amps: 5, charging_strategy: 'solar', departure_time: '',
    grid_budget_total_kwh: 25, grid_budget_used_kwh: 3, max_grid_import_w: 7000,
    hours_until_sunset: 5, session_elapsed_mins: 20, session_kwh_added: 1.0,
    session_solar_pct: 90, current_time: '12:00',
    has_home_battery: false, has_net_metering: false, panel_capacity_w: 5000,
    estimated_available_w: 3800, forecasted_irradiance_wm2: 820, efficiency_coeff: 4.63,
  },
}

// --- Component ---
export function Admin() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [result, setResult] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showPrompt, setShowPrompt] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  // Prompt editor
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [editedPrompt, setEditedPrompt] = useState('')
  const [promptEditing, setPromptEditing] = useState(false)
  const [promptLoading, setPromptLoading] = useState(false)

  // AI Settings
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')

  // Load AI settings on mount
  useEffect(() => {
    ;(async () => {
      try {
        const resp = await apiFetch('/api/admin/ai-settings')
        if (resp.ok) {
          setAiSettings(await resp.json())
        }
      } catch {
        // ignore
      } finally {
        setSettingsLoading(false)
      }
    })()
  }, [])

  const saveSettings = useCallback(async () => {
    if (!aiSettings) return
    setSettingsSaving(true)
    setSettingsMsg('')
    try {
      const resp = await apiFetch('/api/admin/ai-settings', {
        method: 'POST',
        body: JSON.stringify(aiSettings),
      })
      if (resp.ok) {
        setSettingsMsg('Settings saved')
        setTimeout(() => setSettingsMsg(''), 3000)
      } else {
        setSettingsMsg('Failed to save')
      }
    } catch {
      setSettingsMsg('Failed to save')
    } finally {
      setSettingsSaving(false)
    }
  }, [aiSettings])

  const updateInput = (key: string, value: string | number | boolean) => {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  const randomize = () => {
    const hasBattery = Math.random() > 0.4
    const panelCap = hasBattery ? 0 : rand(3000, 8000)
    const irr = randF(200, 900)
    const eff = randF(3.0, 5.5)
    setInputs({
      solar_w: rand(200, 5500),
      household_w: rand(400, 1500),
      grid_import_w: rand(-500, 800),
      battery_soc: hasBattery ? rand(10, 95) : 0,
      battery_w: hasBattery ? rand(-500, 500) : 0,
      solar_trend: ['rising', 'stable', 'falling'][rand(0, 2)],
      tesla_soc: rand(15, 90),
      target_soc: rand(60, 100),
      current_amps: rand(0, 24),
      charging_strategy: Math.random() > 0.5 ? 'solar' : 'departure',
      departure_time: Math.random() > 0.5 ? `${String(rand(5, 9)).padStart(2, '0')}:00` : '',
      grid_budget_total_kwh: rand(10, 40),
      grid_budget_used_kwh: randF(0, 20),
      max_grid_import_w: rand(3000, 10000),
      hours_until_sunset: randF(0.5, 8),
      session_elapsed_mins: rand(5, 180),
      session_kwh_added: randF(0.5, 15),
      session_solar_pct: rand(20, 100),
      current_time: `${String(rand(6, 18)).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}`,
      has_home_battery: hasBattery,
      has_net_metering: Math.random() > 0.7,
      panel_capacity_w: panelCap,
      estimated_available_w: !hasBattery ? Math.min(panelCap, Math.round(irr * eff)) : 0,
      forecasted_irradiance_wm2: !hasBattery ? irr : 0,
      efficiency_coeff: !hasBattery ? eff : 0,
    })
  }

  const generatePrompt = async () => {
    setPromptLoading(true)
    try {
      const resp = await apiFetch('/api/debug/ai-prompt-preview', {
        method: 'POST',
        body: JSON.stringify(inputs),
      })
      if (resp.ok) {
        const data = await resp.json()
        setGeneratedPrompt(data.prompt)
        setEditedPrompt(data.prompt)
        setPromptEditing(false)
      }
    } catch {
      // ignore
    } finally {
      setPromptLoading(false)
    }
  }

  const runTest = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const payload: Record<string, unknown> = { ...inputs }
      if (editedPrompt && editedPrompt !== generatedPrompt) {
        payload.custom_prompt = editedPrompt
      }
      const resp = await apiFetch('/api/debug/ai-test', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || `HTTP ${resp.status}`)
      }
      const data: TestResult = await resp.json()
      setResult(data)
      const rec = data.pipeline['3_parsed_recommendation']
      setHistory((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          amps: rec.recommended_amps,
          confidence: rec.confidence,
          reasoning: rec.reasoning,
          solar: inputs.solar_w,
          soc: `${inputs.tesla_soc}→${inputs.target_soc}%`,
          responseSecs: data.timing.ollama_response_secs,
        },
        ...prev,
      ])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const confColor = (c: string) =>
    c === 'high' ? '#22c55e' : c === 'medium' ? '#f59e0b' : '#ef4444'

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Bot size={22} color="#a855f7" />
        <Typography variant="h5" fontWeight="700">
          AI Admin
        </Typography>
      </Box>
      <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
        Test the AI pipeline with mock data and tune sensitivity settings.
      </Typography>

      {/* === AI Sensitivity Settings === */}
      <Card sx={{ p: 2.5, mb: 3, border: '1px solid rgba(168,85,247,0.2)' }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 2 }}
        >
          AI Sensitivity Settings
        </Typography>
        {settingsLoading ? (
          <CircularProgress size={20} sx={{ color: '#a855f7' }} />
        ) : aiSettings ? (
          <>
            {/* Model Settings */}
            <Typography variant="caption" color="#a855f7" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              Model Configuration
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Primary Model"
                  value={aiSettings.ai_model}
                  onChange={(e) => setAiSettings({ ...aiSettings, ai_model: e.target.value })}
                  size="small"
                  fullWidth
                  helperText="Main Ollama model for AI decisions. Larger models are smarter but slower."
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Fallback Model"
                  value={aiSettings.ai_fallback_model}
                  onChange={(e) => setAiSettings({ ...aiSettings, ai_fallback_model: e.target.value })}
                  size="small"
                  fullWidth
                  helperText="Used when primary model is unreachable. Should be smaller/faster."
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Temperature"
                  type="number"
                  value={aiSettings.ai_temperature}
                  onChange={(e) =>
                    setAiSettings({ ...aiSettings, ai_temperature: e.target.value })
                  }
                  size="small"
                  fullWidth
                  inputProps={{ min: 0, max: 2, step: 0.05 }}
                  helperText="Creativity vs consistency. 0 = deterministic, 0.1 = focused, 0.5+ = creative."
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Max Tokens"
                  type="number"
                  value={aiSettings.ai_max_tokens}
                  onChange={(e) =>
                    setAiSettings({ ...aiSettings, ai_max_tokens: e.target.value })
                  }
                  size="small"
                  fullWidth
                  inputProps={{ min: 50, max: 500 }}
                  helperText="Max response length. 150 is typical. Higher = more detailed reasoning."
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Retry Attempts"
                  type="number"
                  value={aiSettings.ai_retry_attempts}
                  onChange={(e) =>
                    setAiSettings({ ...aiSettings, ai_retry_attempts: e.target.value })
                  }
                  size="small"
                  fullWidth
                  inputProps={{ min: 1, max: 5 }}
                  helperText="Retries before falling back. More retries = more resilient but slower recovery."
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2, borderColor: '#1a2a3d' }} />

            {/* Amp Limits */}
            <Typography variant="caption" color="#f5c518" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              Charging Amp Limits
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Min Amps"
                  type="number"
                  value={aiSettings.ai_min_amps}
                  onChange={(e) => setAiSettings({ ...aiSettings, ai_min_amps: e.target.value })}
                  size="small"
                  fullWidth
                  InputProps={{
                    endAdornment: <InputAdornment position="end">A</InputAdornment>,
                  }}
                  helperText="Floor for AI recommendations. Tesla minimum is 5A. Below this, AI will stop charging instead."
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Max Amps"
                  type="number"
                  value={aiSettings.ai_max_amps}
                  onChange={(e) => setAiSettings({ ...aiSettings, ai_max_amps: e.target.value })}
                  size="small"
                  fullWidth
                  InputProps={{
                    endAdornment: <InputAdornment position="end">A</InputAdornment>,
                  }}
                  helperText="Ceiling for AI recommendations. Limits max charging speed regardless of AI output."
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2, borderColor: '#1a2a3d' }} />

            {/* Timing */}
            <Typography variant="caption" color="#3b82f6" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              AI Call Timing
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Call Interval"
                  type="number"
                  value={aiSettings.ai_call_interval_secs}
                  onChange={(e) =>
                    setAiSettings({ ...aiSettings, ai_call_interval_secs: e.target.value })
                  }
                  size="small"
                  fullWidth
                  InputProps={{
                    endAdornment: <InputAdornment position="end">sec</InputAdornment>,
                  }}
                  helperText="Min seconds between AI calls. Lower = more responsive but more Ollama load. Min 60s."
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Stale Threshold"
                  type="number"
                  value={aiSettings.ai_stale_threshold_secs}
                  onChange={(e) =>
                    setAiSettings({ ...aiSettings, ai_stale_threshold_secs: e.target.value })
                  }
                  size="small"
                  fullWidth
                  InputProps={{
                    endAdornment: <InputAdornment position="end">sec</InputAdornment>,
                  }}
                  helperText="Force a new AI call if the last recommendation is older than this. Prevents stale decisions."
                />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<Save size={14} />}
                onClick={saveSettings}
                disabled={settingsSaving}
                sx={{
                  bgcolor: '#a855f7',
                  '&:hover': { bgcolor: '#9333ea' },
                  textTransform: 'none',
                }}
              >
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </Button>
              {settingsMsg && (
                <Typography variant="caption" color={settingsMsg === 'Settings saved' ? '#22c55e' : '#ef4444'}>
                  {settingsMsg}
                </Typography>
              )}
              <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                These settings apply to the live AI optimizer when charging
              </Typography>
            </Box>
          </>
        ) : (
          <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.08)' }}>
            Failed to load AI settings
          </Alert>
        )}
      </Card>

      {/* === Test Bench === */}
      <Card sx={{ p: 2.5, mb: 3 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 2 }}
        >
          AI Test Bench
        </Typography>

        {/* Solax */}
        <Typography variant="caption" color="#f5c518" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Solax — Solar & Grid
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={4} sm={2}>
            <TextField label="Solar (W)" type="number" value={inputs.solar_w} onChange={(e) => updateInput('solar_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Household (W)" type="number" value={inputs.household_w} onChange={(e) => updateInput('household_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Grid Import (W)" type="number" value={inputs.grid_import_w} onChange={(e) => updateInput('grid_import_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Battery SoC (%)" type="number" value={inputs.battery_soc} onChange={(e) => updateInput('battery_soc', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Battery (W)" type="number" value={inputs.battery_w} onChange={(e) => updateInput('battery_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <Select value={inputs.solar_trend} onChange={(e) => updateInput('solar_trend', e.target.value)} size="small" fullWidth>
              <MenuItem value="rising">Rising</MenuItem>
              <MenuItem value="stable">Stable</MenuItem>
              <MenuItem value="falling">Falling</MenuItem>
            </Select>
          </Grid>
        </Grid>

        {/* Tesla */}
        <Typography variant="caption" color="#3b82f6" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Tesla — Car State
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={4} sm={2}>
            <TextField label="Tesla SoC (%)" type="number" value={inputs.tesla_soc} onChange={(e) => updateInput('tesla_soc', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Target SoC (%)" type="number" value={inputs.target_soc} onChange={(e) => updateInput('target_soc', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Current Amps" type="number" value={inputs.current_amps} onChange={(e) => updateInput('current_amps', +e.target.value)} size="small" fullWidth />
          </Grid>
        </Grid>

        {/* Strategy */}
        <Typography variant="caption" color="#22c55e" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Strategy & Budget
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={4} sm={2}>
            <Select value={inputs.charging_strategy} onChange={(e) => updateInput('charging_strategy', e.target.value)} size="small" fullWidth>
              <MenuItem value="solar">Solar-first</MenuItem>
              <MenuItem value="departure">Departure</MenuItem>
            </Select>
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Departure" value={inputs.departure_time} onChange={(e) => updateInput('departure_time', e.target.value)} size="small" fullWidth placeholder="07:00" />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Budget Total (kWh)" type="number" value={inputs.grid_budget_total_kwh} onChange={(e) => updateInput('grid_budget_total_kwh', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Budget Used (kWh)" type="number" value={inputs.grid_budget_used_kwh} onChange={(e) => updateInput('grid_budget_used_kwh', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Max Grid (W)" type="number" value={inputs.max_grid_import_w} onChange={(e) => updateInput('max_grid_import_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Hrs to Sunset" type="number" value={inputs.hours_until_sunset} onChange={(e) => updateInput('hours_until_sunset', +e.target.value)} size="small" fullWidth inputProps={{ step: 0.5 }} />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Current Time" value={inputs.current_time} onChange={(e) => updateInput('current_time', e.target.value)} size="small" fullWidth placeholder="13:00" helperText="HH:MM" />
          </Grid>
        </Grid>

        {/* Inverter Setup */}
        <Typography variant="caption" color="#a855f7" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Inverter Setup
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={4} sm={2}>
            <Select value={inputs.has_home_battery ? 'true' : 'false'} onChange={(e) => updateInput('has_home_battery', e.target.value === 'true')} size="small" fullWidth>
              <MenuItem value="true">Has Battery</MenuItem>
              <MenuItem value="false">No Battery</MenuItem>
            </Select>
          </Grid>
          <Grid item xs={4} sm={2}>
            <Select value={inputs.has_net_metering ? 'true' : 'false'} onChange={(e) => updateInput('has_net_metering', e.target.value === 'true')} size="small" fullWidth>
              <MenuItem value="true">Net Metering</MenuItem>
              <MenuItem value="false">No Export</MenuItem>
            </Select>
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Panel Cap (W)" type="number" value={inputs.panel_capacity_w} onChange={(e) => updateInput('panel_capacity_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Est. Available (W)" type="number" value={inputs.estimated_available_w} onChange={(e) => updateInput('estimated_available_w', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Irradiance (W/m²)" type="number" value={inputs.forecasted_irradiance_wm2} onChange={(e) => updateInput('forecasted_irradiance_wm2', +e.target.value)} size="small" fullWidth />
          </Grid>
          <Grid item xs={4} sm={2}>
            <TextField label="Eff. Coeff" type="number" value={inputs.efficiency_coeff} onChange={(e) => updateInput('efficiency_coeff', +e.target.value)} size="small" fullWidth inputProps={{ step: 0.1 }} />
          </Grid>
        </Grid>

        {/* Buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Button
            variant="contained"
            startIcon={promptLoading ? <CircularProgress size={14} color="inherit" /> : <FileText size={14} />}
            onClick={generatePrompt}
            disabled={promptLoading || loading}
            sx={{ bgcolor: '#2a3f57', '&:hover': { bgcolor: '#3a5070' }, textTransform: 'none', fontWeight: 700 }}
          >
            {promptLoading ? 'Generating...' : 'Generate Prompt'}
          </Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
            onClick={runTest}
            disabled={loading}
            sx={{ bgcolor: '#f5c518', color: '#0f1923', '&:hover': { bgcolor: '#e0b400' }, textTransform: 'none', fontWeight: 700 }}
          >
            {loading ? 'Calling Ollama...' : editedPrompt && editedPrompt !== generatedPrompt ? 'Run with Custom Prompt' : 'Run AI Test'}
          </Button>
          <Button variant="outlined" size="small" startIcon={<Shuffle size={14} />} onClick={randomize} sx={{ textTransform: 'none', borderColor: '#2a3f57', color: '#8da4be' }}>
            Randomize
          </Button>
          <Button variant="outlined" size="small" startIcon={<Sun size={14} />} onClick={() => setInputs(presets.peakSolar)} sx={{ textTransform: 'none', borderColor: '#2a3f57', color: '#f5c518' }}>
            Peak Solar
          </Button>
          <Button variant="outlined" size="small" startIcon={<Cloud size={14} />} onClick={() => setInputs(presets.lowSolar)} sx={{ textTransform: 'none', borderColor: '#2a3f57', color: '#8da4be' }}>
            Low Solar
          </Button>
          <Button variant="outlined" size="small" startIcon={<Car size={14} />} onClick={() => setInputs(presets.departure)} sx={{ textTransform: 'none', borderColor: '#2a3f57', color: '#3b82f6' }}>
            Departure
          </Button>
          <Button variant="outlined" size="small" startIcon={<Wallet size={14} />} onClick={() => setInputs(presets.budgetCrunch)} sx={{ textTransform: 'none', borderColor: '#2a3f57', color: '#f59e0b' }}>
            Budget Crunch
          </Button>
          <Button variant="outlined" size="small" startIcon={<Zap size={14} />} onClick={() => setInputs(presets.noBattery)} sx={{ textTransform: 'none', borderColor: '#2a3f57', color: '#a855f7' }}>
            No Battery
          </Button>
        </Box>

        {/* Prompt Editor */}
        {generatedPrompt && (
          <Card sx={{ p: 2, mb: 2, bgcolor: '#0b1420', border: promptEditing ? '1px solid #a855f7' : '1px solid #1a2a3d' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Prompt {promptEditing ? '(Editing)' : '(Read-only)'} {editedPrompt !== generatedPrompt && '• Modified'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {editedPrompt !== generatedPrompt && (
                  <Button
                    size="small"
                    onClick={() => { setEditedPrompt(generatedPrompt); setPromptEditing(false) }}
                    sx={{ textTransform: 'none', color: '#ef4444', fontSize: '0.7rem', minWidth: 0, px: 1 }}
                  >
                    Reset
                  </Button>
                )}
                <Button
                  size="small"
                  startIcon={<Edit3 size={12} />}
                  onClick={() => setPromptEditing(!promptEditing)}
                  sx={{ textTransform: 'none', color: promptEditing ? '#a855f7' : '#4a6382', fontSize: '0.7rem', minWidth: 0, px: 1 }}
                >
                  {promptEditing ? 'Lock' : 'Edit'}
                </Button>
              </Box>
            </Box>
            {promptEditing ? (
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 300,
                  maxHeight: 500,
                  background: '#0b1420',
                  color: '#8da4be',
                  border: '1px solid #2a3f57',
                  borderRadius: 4,
                  padding: 8,
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />
            ) : (
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#6b8299', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                  {editedPrompt || generatedPrompt}
                </Typography>
              </Box>
            )}
          </Card>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(239,68,68,0.08)' }}>
            {error}
          </Alert>
        )}
      </Card>

      {/* === Results === */}
      {result && (
        <>
          {/* AI Decision */}
          <Card sx={{ p: 2.5, mb: 2, border: '1px solid #f5c518' }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              AI Decision
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h3" fontWeight="700" color="#f5c518">
                {result.pipeline['3_parsed_recommendation'].recommended_amps}A
              </Typography>
              <Chip
                label={`${result.pipeline['3_parsed_recommendation'].confidence} confidence`}
                size="small"
                sx={{
                  bgcolor: `${confColor(result.pipeline['3_parsed_recommendation'].confidence)}15`,
                  color: confColor(result.pipeline['3_parsed_recommendation'].confidence),
                  border: `1px solid ${confColor(result.pipeline['3_parsed_recommendation'].confidence)}30`,
                  fontWeight: 600,
                }}
              />
            </Box>
            <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
              "{result.pipeline['3_parsed_recommendation'].reasoning}"
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
              <Typography variant="caption" color="text.disabled">
                Response: <strong>{result.timing.ollama_response_secs}s</strong>
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Model: <strong>{result.timing.model}</strong>
              </Typography>
            </Box>
          </Card>

          {/* Tessie Command */}
          <Card sx={{ p: 2.5, mb: 2, border: '1px solid rgba(168,85,247,0.3)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              Tessie Command (Dry Run)
            </Typography>
            <Typography variant="body1" color="#a855f7" fontWeight="700">
              {result.pipeline['4_tessie_command'].action} → {result.pipeline['4_tessie_command'].amps}A
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
              {result.pipeline['4_tessie_command'].endpoint}
            </Typography>
            <Typography variant="caption" color="#f59e0b">
              {result.pipeline['4_tessie_command'].note}
            </Typography>
          </Card>

          {/* User Banner Preview */}
          <Card sx={{ p: 2.5, mb: 2, border: '1px solid rgba(34,197,94,0.3)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              User-Facing Banner Preview
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Bot size={16} color="#a855f7" />
              <Typography variant="body2" color="#a855f7" fontWeight="700">
                AI Optimizing
              </Typography>
              <Chip
                label={result.pipeline['3_parsed_recommendation'].confidence}
                size="small"
                sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}
              />
            </Box>
            <Typography variant="h6" fontWeight="700" color="#f5c518" sx={{ mb: 0.5 }}>
              {result.pipeline['3_parsed_recommendation'].recommended_amps}A
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              "{result.pipeline['5_user_facing_message'].banner_text}"
            </Typography>
          </Card>

          {/* Collapsible sections */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button size="small" onClick={() => setShowRaw(!showRaw)} sx={{ textTransform: 'none', color: '#4a6382', fontSize: '0.75rem' }}>
              {showRaw ? '▼' : '▶'} Raw Ollama Response
            </Button>
            <Button size="small" onClick={() => setShowPrompt(!showPrompt)} sx={{ textTransform: 'none', color: '#4a6382', fontSize: '0.75rem' }}>
              {showPrompt ? '▼' : '▶'} Full Prompt Sent
            </Button>
          </Box>
          {showRaw && (
            <Card sx={{ p: 2, mb: 2, bgcolor: '#0b1420' }}>
              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#8da4be', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                {result.pipeline['2_ollama_raw_response']}
              </Typography>
            </Card>
          )}
          {showPrompt && (
            <Card sx={{ p: 2, mb: 2, bgcolor: '#0b1420', maxHeight: 300, overflow: 'auto' }}>
              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#6b8299', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                {result.pipeline['1_prompt_sent']}
              </Typography>
            </Card>
          )}
        </>
      )}

      {/* === History === */}
      {history.length > 0 && (
        <Card sx={{ p: 2.5, mt: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5 }}
          >
            Test History ({history.length})
          </Typography>
          {history.map((h, i) => (
            <Box
              key={i}
              sx={{
                borderLeft: '3px solid #2a3f57',
                pl: 1.5,
                py: 0.75,
                mb: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.disabled">
                  {h.time}
                </Typography>
                <Typography variant="body2" fontWeight="700" color="#f5c518">
                  {h.amps}A
                </Typography>
                <Chip
                  label={h.confidence}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    bgcolor: `${confColor(h.confidence)}15`,
                    color: confColor(h.confidence),
                  }}
                />
                <Typography variant="caption" color="text.disabled">
                  ☀️{h.solar}W · 🔋{h.soc} · {h.responseSecs}s
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                "{h.reasoning}"
              </Typography>
            </Box>
          ))}
        </Card>
      )}

      {/* Future: Model comparison section placeholder */}
      <Card sx={{ p: 2.5, mt: 3, opacity: 0.4, border: '1px dashed #2a3f57' }}>
        <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          Coming Soon — Multi-Model Comparison
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
          Test multiple Ollama models or external AI APIs side-by-side with the same scenario.
        </Typography>
      </Card>
    </Box>
  )
}
