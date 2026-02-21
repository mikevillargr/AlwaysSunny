import { useState, useEffect, useCallback } from 'react'
import type { Settings } from '../types/api'
import { apiFetch } from '../lib/api'

const DEFAULT_SETTINGS: Settings = {
  target_soc: 80,
  default_charging_amps: 8,
  daily_grid_budget_kwh: 5.0,
  max_grid_import_w: 500,
  electricity_rate: 10.83,
  electricity_rate_updated_at: null,
  home_lat: null,
  home_lon: null,
  telegram_chat_id: null,
  timezone: 'Asia/Manila',
  notif_grid_budget: true,
  notif_session_complete: true,
  notif_ai_override: false,
  notif_rate_reminder: true,
}

interface UseSettingsReturn {
  settings: Settings
  loading: boolean
  error: string | null
  updateSettings: (updates: Partial<Settings>) => Promise<void>
  refresh: () => void
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/settings')
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: Settings = await res.json()
      setSettings(data)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.warn('[useSettings] Backend unavailable, using defaults:', message)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: Settings = await res.json()
      setSettings(data)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[useSettings] Failed to save settings:', message)
      // Optimistically apply locally even if backend fails
      setSettings((prev) => ({ ...prev, ...updates }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  return { settings, loading, error, updateSettings, refresh: fetchSettings }
}
