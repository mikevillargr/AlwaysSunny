import { useState, useEffect, useCallback } from 'react'
import type { StatusResponse } from '../types/api'
import { SAMPLE_STATUS, STATUS_POLL_INTERVAL } from '../utils/constants'
import { apiFetch } from '../lib/api'

interface UseStatusReturn {
  status: StatusResponse
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useStatus(): UseStatusReturn {
  const [status, setStatus] = useState<StatusResponse>(SAMPLE_STATUS as StatusResponse)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/status')
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: StatusResponse = await res.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      // Backend not available — keep using current state (sample data on first load)
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.warn('[useStatus] Backend unavailable, using cached/sample data:', message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch attempt
    fetchStatus()

    // Fast retries on initial load to catch first control loop tick
    const retry1 = setTimeout(fetchStatus, 3000)
    const retry2 = setTimeout(fetchStatus, 8000)

    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, STATUS_POLL_INTERVAL)
    return () => {
      clearTimeout(retry1)
      clearTimeout(retry2)
      clearInterval(interval)
    }
  }, [fetchStatus])

  return { status, loading, error, refresh: fetchStatus }
}
