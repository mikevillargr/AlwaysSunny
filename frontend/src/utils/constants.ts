// Design tokens from UI_SPEC.md
export const COLORS = {
  bgBase: '#0f1923',
  bgCard: '#162030',
  bgCardRaised: '#1e2d40',
  borderSubtle: '#2a3f57',
  solarYellow: '#f5c518',
  solarYellowDim: '#7a6209',
  gridBlue: '#3b82f6',
  evGreen: '#22c55e',
  homeTeal: '#14b8a6',
  alertRed: '#ef4444',
  warningAmber: '#f59e0b',
  aiPurple: '#a855f7',
  textPrimary: '#f0f4f8',
  textSecondary: '#8da4be',
  textDim: '#4a6382',
} as const

// API polling interval (ms)
export const STATUS_POLL_INTERVAL = 30_000

// Sample data from UI_SPEC.md — used as initial/loading state
export const SAMPLE_STATUS = {
  mode: 'Solar Optimizing' as const,
  charger_status: 'charging_at_home' as const,
  home_detection_method: 'named_location' as const,
  solar_w: 2840,
  household_demand_w: 880,
  grid_import_w: 120,
  battery_soc: 78,
  battery_w: -200,
  solax_data_age_secs: 45,
  tesla_soc: 58,
  tesla_charging_amps: 12,
  tesla_charging_kw: 2.9,
  charge_port_connected: true,
  charging_state: 'Charging' as const,
  minutes_to_full_charge: 180,
  ai_enabled: true,
  ai_status: 'active' as const,
  ai_recommended_amps: 12,
  ai_reasoning: 'Peak solar in 45 min — holding moderate rate, will increase to 18A at 11am',
  ai_confidence: 'medium' as const,
  ai_trigger_reason: 'scheduled' as const,
  ai_last_updated_secs: 120,
  target_soc: 80,
  tessie_enabled: true,
  charging_strategy: 'departure',
  departure_time: '',
  session: {
    started_at: '2026-02-20T09:14:00',
    elapsed_mins: 84,
    kwh_added: 8.4,
    solar_kwh: 7.1,
    grid_kwh: 1.3,
    solar_pct: 85,
    saved_amount: 710,
  },
  forecast: {
    sunrise: '05:58',
    sunset: '17:52',
    peak_window_start: '10:00',
    peak_window_end: '14:00',
    hours_until_sunset: 4.2,
    current_temperature_c: 28.5,
    hourly: [
      { hour: '06:00', irradiance_wm2: 120, expected_yield_w: 580, cloud_cover_pct: 20 },
      { hour: '07:00', irradiance_wm2: 280, expected_yield_w: 1360, cloud_cover_pct: 25 },
      { hour: '08:00', irradiance_wm2: 480, expected_yield_w: 2340, cloud_cover_pct: 30 },
      { hour: '09:00', irradiance_wm2: 620, expected_yield_w: 3020, cloud_cover_pct: 35 },
      { hour: '10:00', irradiance_wm2: 710, expected_yield_w: 3460, cloud_cover_pct: 20 },
      { hour: '11:00', irradiance_wm2: 740, expected_yield_w: 3610, cloud_cover_pct: 15 },
      { hour: '12:00', irradiance_wm2: 730, expected_yield_w: 3560, cloud_cover_pct: 15 },
      { hour: '13:00', irradiance_wm2: 680, expected_yield_w: 3310, cloud_cover_pct: 20 },
      { hour: '14:00', irradiance_wm2: 560, expected_yield_w: 2730, cloud_cover_pct: 40 },
      { hour: '15:00', irradiance_wm2: 380, expected_yield_w: 1850, cloud_cover_pct: 55 },
      { hour: '16:00', irradiance_wm2: 210, expected_yield_w: 1020, cloud_cover_pct: 60 },
      { hour: '17:00', irradiance_wm2: 80, expected_yield_w: 390, cloud_cover_pct: 65 },
    ],
  },
  grid_budget_total_kwh: 5.0,
  grid_budget_used_kwh: 2.1,
  grid_budget_pct: 42,
}

/**
 * Convert 24-hour time string (e.g. "14:00", "07:30") to 12-hour format.
 * Returns e.g. "2pm", "7:30am", "12pm", "12am".
 */
export function formatHour12(time: string): string {
  if (!time) return ''
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  if (isNaN(h)) return time
  const m = mStr ? parseInt(mStr, 10) : 0
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`
}

// AI trigger reason labels for display
export const TRIGGER_LABELS: Record<string, string> = {
  scheduled: 'routine check',
  solar_shift: 'solar trend shifted',
  soc_threshold: 'SoC milestone reached',
  budget_warning: 'grid budget running low',
  departure_soon: 'departure window approaching',
  manual: 'you requested a refresh',
  stale: 'recommendation refreshed',
}
