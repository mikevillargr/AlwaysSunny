// TypeScript interfaces matching the FastAPI /api/status response
// from ARCHITECTURE.md and DATA_FLOWS.md

export type Mode =
  | 'Solar Optimizing'
  | 'Suspended – Night'
  | 'Suspended – Unplugged'
  | 'Suspended – Charging Away'
  | 'Suspended – Location Unknown'
  | 'Cutoff – Grid Budget Reached'
  | 'Manual Override'
  | 'Charging – No Limits'
  | 'AI Optimizing'
  | 'Tessie Disconnected'
  | 'Solar-first'
  | 'Ready by Departure'
  | string

export type ChargerStatus =
  | 'charging_at_home'
  | 'charging_away'
  | 'location_unknown'
  | 'not_connected'

export type HomeDetectionMethod = 'named_location' | 'gps_proximity' | null

export type AIStatus =
  | 'active'
  | 'fallback'
  | 'suspended_night'
  | 'suspended_no_solar'
  | 'suspended_away'
  | 'standby'
  | 'offline'
  | string  // allows error:ReadTimeout etc from backend

export type AIConfidence = 'low' | 'medium' | 'high'

export type AITriggerReason =
  | 'scheduled'
  | 'solar_shift'
  | 'soc_threshold'
  | 'budget_warning'
  | 'departure_soon'
  | 'manual'
  | 'stale'

export type ChargingState = 'Charging' | 'Complete' | 'Stopped' | 'Disconnected'

export interface ForecastHour {
  hour: string
  irradiance_wm2: number
  expected_yield_w: number
  cloud_cover_pct: number
  temperature_c: number
}

export interface Forecast {
  sunrise: string
  sunset: string
  peak_window_start: string
  peak_window_end: string
  hours_until_sunset: number
  current_temperature_c: number
  hourly: ForecastHour[]
}

export interface Session {
  started_at: string
  elapsed_mins: number
  kwh_added: number
  solar_kwh: number
  grid_kwh: number
  solar_pct: number
  saved_amount: number
}

export interface StatusResponse {
  // Mode
  mode: Mode
  // Charger pill
  charger_status: ChargerStatus
  home_detection_method: HomeDetectionMethod
  // Live energy values (from Solax)
  solar_w: number
  household_demand_w: number
  grid_import_w: number
  battery_soc: number
  battery_w: number
  solax_data_age_secs: number
  // Tesla
  tesla_soc: number
  tesla_charging_amps: number
  tesla_charge_current_request: number
  tesla_charging_kw: number
  charge_port_connected: boolean
  charging_state: ChargingState
  minutes_to_full_charge: number
  tesla_throttled: boolean
  // Last command sent to Tessie
  last_amps_sent: number
  // AI state
  ai_enabled: boolean
  ai_status: AIStatus
  ai_recommended_amps: number
  ai_reasoning: string
  ai_confidence: AIConfidence
  ai_trigger_reason: AITriggerReason
  ai_last_updated_secs: number
  // Target SoC from settings
  target_soc: number
  // Tessie connection
  tessie_enabled: boolean
  // Charging strategy
  charging_strategy: string
  departure_time: string
  // Session (null if no active session)
  session: Session | null
  // Forecast
  forecast: Forecast
  // Grid budget
  grid_budget_total_kwh: number
  grid_budget_used_kwh: number
  grid_budget_pct: number
  // Solar subsidy (Tesla-specific)
  solar_to_tesla_w: number
  live_tesla_solar_pct: number
  daily_tesla_solar_pct: number
  // Legacy
  live_solar_pct: number
  daily_solar_pct: number
  // Currency
  currency_code: string
  // AI service health
  ollama_healthy: boolean
  // Forecast location
  forecast_location_set: boolean
  forecast_location_lat: number | null
  forecast_location_lon: number | null
  forecast_location_name: string | null
}

// Session history types
export interface SessionRecord {
  id: number
  started_at: string
  ended_at: string
  duration_mins: number
  kwh_added: number
  solar_kwh: number
  grid_kwh: number
  solar_pct: number
  saved_amount: number
  electricity_rate: number
  start_soc: number
  end_soc: number
  target_soc: number
  subsidy_calculation_method: string
}

// Settings types
export interface Settings {
  target_soc: number
  default_charging_amps: number
  daily_grid_budget_kwh: number
  max_grid_import_w: number
  electricity_rate: number | null
  electricity_rate_updated_at: string | null
  home_lat: number | null
  home_lon: number | null
  telegram_chat_id: string | null
  timezone: string
  notif_grid_budget: boolean
  notif_session_complete: boolean
  notif_ai_override: boolean
  notif_rate_reminder: boolean
  currency_code: string
}

// Health check types
export interface ServiceHealth {
  name: string
  status: 'connected' | 'disconnected' | 'error'
  detail: string
}

export interface HealthResponse {
  solax: ServiceHealth
  tessie: ServiceHealth
  ollama: ServiceHealth
  open_meteo: ServiceHealth
}
