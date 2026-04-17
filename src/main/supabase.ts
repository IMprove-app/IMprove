import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const SUPABASE_URL = 'https://ranxrprflhivjwvjjpdx.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_MXzZZ0b45akIUBmdeWbCFg_6qwsuawX'

let supabase: SupabaseClient | null = null
let authFilePath: string

function getAuthFilePath(): string {
  if (!authFilePath) {
    const dir = path.join(app.getPath('userData'), 'data')
    fs.mkdirSync(dir, { recursive: true })
    authFilePath = path.join(dir, 'auth.json')
  }
  return authFilePath
}

function loadAuthTokens(): Record<string, string> {
  try {
    const p = getAuthFilePath()
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function saveAuthTokens(data: Record<string, string>): void {
  fs.writeFileSync(getAuthFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

// Custom storage adapter for Node.js (Supabase needs localStorage-like API)
const nodeStorage = {
  getItem: (key: string): string | null => {
    const data = loadAuthTokens()
    return data[key] ?? null
  },
  setItem: (key: string, value: string): void => {
    const data = loadAuthTokens()
    data[key] = value
    saveAuthTokens(data)
  },
  removeItem: (key: string): void => {
    const data = loadAuthTokens()
    delete data[key]
    saveAuthTokens(data)
  }
}

export function initSupabase(): SupabaseClient {
  if (supabase) return supabase
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: nodeStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  })
  return supabase
}

export function getSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase not initialized')
  return supabase
}

export async function signUp(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  const { error } = await sb.auth.signUp({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const sb = getSupabase()
  await sb.auth.signOut()
  // Clear stored tokens
  try {
    const p = getAuthFilePath()
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch { /* ignore */ }
}

export async function getAuthStatus(): Promise<{ loggedIn: boolean; email?: string; userId?: string }> {
  const sb = getSupabase()
  const { data: { session } } = await sb.auth.getSession()
  if (session?.user) {
    return { loggedIn: true, email: session.user.email, userId: session.user.id }
  }
  return { loggedIn: false }
}
