import { BrowserWindow } from 'electron'
import { getSupabase, getAuthStatus } from './supabase'
import {
  loadStore as getStore,
  saveStore,
  HabitRow,
  SessionRow
} from './db'

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline'

let syncState: SyncState = 'idle'
let lastSyncAt: string | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null

function notifyRenderer(state: SyncState, error?: string): void {
  syncState = state
  const wins = BrowserWindow.getAllWindows()
  for (const win of wins) {
    win.webContents.send('sync:status', { state, lastSync: lastSyncAt, error })
  }
}

export function getSyncStatus(): { state: SyncState; lastSync: string | null } {
  return { state: syncState, lastSync: lastSyncAt }
}

export async function runSync(): Promise<void> {
  const auth = await getAuthStatus()
  if (!auth.loggedIn || !auth.userId) return

  notifyRenderer('syncing')

  try {
    const sb = getSupabase()
    const userId = auth.userId
    const store = getStore()

    // Initialize sync_meta if needed
    if (!store.sync_meta) {
      store.sync_meta = { last_sync_at: null, user_id: userId }
    }
    store.sync_meta.user_id = userId

    const since = store.sync_meta.last_sync_at

    // ========== PUSH phase ==========

    // Push habits
    const localHabits = store.habits.filter(h => !since || (h.updated_at && h.updated_at > since))
    if (localHabits.length > 0) {
      const rows = localHabits.map(h => ({
        id: h.id,
        user_id: userId,
        name: h.name,
        icon: h.icon,
        target_url: h.target_url || '',
        target_app: h.target_app || '',
        daily_goal_m: h.daily_goal_m,
        sort_order: h.sort_order,
        is_archived: h.is_archived,
        created_at: h.created_at,
        updated_at: h.updated_at || h.created_at,
        deleted_at: h.deleted_at || null
      }))
      await sb.from('habits').upsert(rows, { onConflict: 'id' })
    }

    // Push completed sessions (not active ones)
    const localSessions = store.sessions.filter(
      s => s.ended_at !== null && (!since || (s.updated_at && s.updated_at > since))
    )
    if (localSessions.length > 0) {
      const rows = localSessions.map(s => ({
        id: s.id,
        user_id: userId,
        habit_id: s.habit_id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        active_sec: s.active_sec,
        idle_sec: s.idle_sec,
        notes: s.notes || '',
        updated_at: s.updated_at || s.started_at
      }))
      await sb.from('sessions').upsert(rows, { onConflict: 'id' })
    }

    // ========== PULL phase ==========

    // Pull remote habits
    let habitsQuery = sb.from('habits').select('*').eq('user_id', userId)
    if (since) {
      habitsQuery = habitsQuery.gt('updated_at', since)
    }
    const { data: remoteHabits } = await habitsQuery

    if (remoteHabits && remoteHabits.length > 0) {
      for (const remote of remoteHabits) {
        const localIdx = store.habits.findIndex(h => h.id === remote.id)
        const remoteRow: HabitRow = {
          id: remote.id,
          name: remote.name,
          icon: remote.icon,
          target_url: remote.target_url || '',
          target_app: remote.target_app || '',
          daily_goal_m: remote.daily_goal_m,
          sort_order: remote.sort_order,
          is_archived: remote.is_archived,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          // New from remote
          store.habits.push(remoteRow)
        } else {
          // Conflict resolution: last-write-wins
          const local = store.habits[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.habits[localIdx] = remoteRow
          }
        }
      }
    }

    // Pull remote sessions
    let sessionsQuery = sb.from('sessions').select('*').eq('user_id', userId)
    if (since) {
      sessionsQuery = sessionsQuery.gt('updated_at', since)
    }
    const { data: remoteSessions } = await sessionsQuery

    if (remoteSessions && remoteSessions.length > 0) {
      for (const remote of remoteSessions) {
        const localIdx = store.sessions.findIndex(s => s.id === remote.id)
        const remoteRow: SessionRow = {
          id: remote.id,
          habit_id: remote.habit_id,
          started_at: remote.started_at,
          ended_at: remote.ended_at,
          active_sec: remote.active_sec,
          idle_sec: remote.idle_sec,
          notes: remote.notes || '',
          updated_at: remote.updated_at
        }

        if (localIdx === -1) {
          store.sessions.push(remoteRow)
        } else {
          const local = store.sessions[localIdx]
          const localTime = local.updated_at || local.started_at
          const remoteTime = remote.updated_at || remote.started_at
          if (remoteTime > localTime) {
            store.sessions[localIdx] = remoteRow
          }
        }
      }
    }

    // Update sync timestamp
    store.sync_meta.last_sync_at = new Date().toISOString()
    lastSyncAt = store.sync_meta.last_sync_at
    saveStore()

    notifyRenderer('idle')
  } catch (err) {
    console.error('Sync error:', err)
    notifyRenderer('error', String(err))
  }
}

export function startPeriodicSync(): void {
  if (syncTimer) return
  // Sync every 60 seconds
  syncTimer = setInterval(async () => {
    const auth = await getAuthStatus()
    if (auth.loggedIn) {
      await runSync()
    }
  }, 60_000)
}

export function stopPeriodicSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}
