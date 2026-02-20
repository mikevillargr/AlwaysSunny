import { supabase } from './supabase'

/**
 * Fetch wrapper that automatically attaches the Supabase JWT token
 * to all API requests as a Bearer token.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(path, {
    ...options,
    headers,
  })
}
