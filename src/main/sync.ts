import { BrowserWindow } from 'electron'
import { getSupabase, getAuthStatus } from './supabase'
import {
  loadStore as getStore,
  saveStore,
  HabitRow,
  SessionRow,
  DeckRow,
  CardRow,
  TodoRow,
  AchievementRow,
  BadgeEventRow,
  UserProgress,
  SnippetRow,
  SnippetFolderRow
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
        category: h.category ?? 'uncategorized',
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
        is_shield: s.is_shield ?? 0,
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
          category: remote.category || 'uncategorized',
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
          is_shield: remote.is_shield ?? 0,
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

    // First-time full push for decks/cards (added after initial release).
    // Bypass `since` filter so pre-existing local data gets uploaded once.
    const cardsFirstSync = !store.sync_meta.cards_synced_once
    const cardsSince = cardsFirstSync ? null : since

    // ========== Decks PUSH ==========
    const localDecks = store.decks.filter(
      d => !cardsSince || (d.updated_at && d.updated_at > cardsSince)
    )
    if (localDecks.length > 0) {
      const rows = localDecks.map(d => ({
        id: d.id,
        user_id: userId,
        name: d.name,
        created_at: d.created_at,
        updated_at: d.updated_at || d.created_at,
        deleted_at: d.deleted_at || null
      }))
      await sb.from('decks').upsert(rows, { onConflict: 'id' })
    }

    // ========== Cards PUSH ==========
    const localCards = store.cards.filter(
      c => !cardsSince || (c.updated_at && c.updated_at > cardsSince)
    )
    if (localCards.length > 0) {
      const rows = localCards.map(c => ({
        id: c.id,
        user_id: userId,
        deck_id: c.deck_id,
        front: c.front,
        back: c.back,
        review_stage: c.review_stage,
        next_review_at: c.next_review_at,
        created_at: c.created_at,
        updated_at: c.updated_at || c.created_at,
        deleted_at: c.deleted_at || null
      }))
      await sb.from('cards').upsert(rows, { onConflict: 'id' })
    }

    // ========== Decks PULL ==========
    let decksQuery = sb.from('decks').select('*').eq('user_id', userId)
    if (since) {
      decksQuery = decksQuery.gt('updated_at', since)
    }
    const { data: remoteDecks } = await decksQuery

    if (remoteDecks && remoteDecks.length > 0) {
      for (const remote of remoteDecks) {
        const localIdx = store.decks.findIndex(d => d.id === remote.id)
        const remoteRow: DeckRow = {
          id: remote.id,
          name: remote.name,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.decks.push(remoteRow)
        } else {
          const local = store.decks[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.decks[localIdx] = remoteRow
          }
        }
      }
    }

    // ========== Cards PULL ==========
    let cardsQuery = sb.from('cards').select('*').eq('user_id', userId)
    if (since) {
      cardsQuery = cardsQuery.gt('updated_at', since)
    }
    const { data: remoteCards } = await cardsQuery

    if (remoteCards && remoteCards.length > 0) {
      for (const remote of remoteCards) {
        const localIdx = store.cards.findIndex(c => c.id === remote.id)
        const remoteRow: CardRow = {
          id: remote.id,
          deck_id: remote.deck_id,
          front: remote.front,
          back: remote.back,
          review_stage: remote.review_stage,
          next_review_at: remote.next_review_at,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.cards.push(remoteRow)
        } else {
          const local = store.cards[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.cards[localIdx] = remoteRow
          }
        }
      }
    }

    // First-time full push for todos (added after initial release).
    // Bypass `since` filter so pre-existing local data gets uploaded once.
    const todosFirstSync = !store.sync_meta.todos_synced_once
    const todosSince = todosFirstSync ? null : since

    // ========== Todos PUSH ==========
    const localTodos = store.todos.filter(
      t => !todosSince || (t.updated_at && t.updated_at > todosSince)
    )
    if (localTodos.length > 0) {
      const rows = localTodos.map(t => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        notes: t.notes || '',
        due_date: t.due_date,
        is_done: t.is_done,
        completed_at: t.completed_at || null,
        sort_order: t.sort_order,
        created_at: t.created_at,
        updated_at: t.updated_at || t.created_at,
        deleted_at: t.deleted_at || null
      }))
      await sb.from('todos').upsert(rows, { onConflict: 'id' })
    }

    // ========== Todos PULL ==========
    let todosQuery = sb.from('todos').select('*').eq('user_id', userId)
    if (since) {
      todosQuery = todosQuery.gt('updated_at', since)
    }
    const { data: remoteTodos } = await todosQuery

    if (remoteTodos && remoteTodos.length > 0) {
      for (const remote of remoteTodos) {
        const localIdx = store.todos.findIndex(t => t.id === remote.id)
        const remoteRow: TodoRow = {
          id: remote.id,
          title: remote.title,
          notes: remote.notes || '',
          due_date: remote.due_date,
          is_done: remote.is_done,
          completed_at: remote.completed_at || undefined,
          sort_order: remote.sort_order,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.todos.push(remoteRow)
        } else {
          const local = store.todos[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.todos[localIdx] = remoteRow
          }
        }
      }
    }

    // First-time full push for snippet folders + snippets.
    const snippetFoldersFirstSync = !store.sync_meta.snippet_folders_synced_once
    const snippetFoldersSince = snippetFoldersFirstSync ? null : since
    const snippetsFirstSync = !store.sync_meta.snippets_synced_once
    const snippetsSince = snippetsFirstSync ? null : since

    // ========== Snippet Folders PUSH ==========
    const localFolders = store.snippet_folders.filter(
      f => !snippetFoldersSince || (f.updated_at && f.updated_at > snippetFoldersSince)
    )
    if (localFolders.length > 0) {
      const rows = localFolders.map(f => ({
        id: f.id,
        user_id: userId,
        name: f.name,
        sort_order: f.sort_order,
        created_at: f.created_at,
        updated_at: f.updated_at || f.created_at,
        deleted_at: f.deleted_at || null
      }))
      await sb.from('snippet_folders').upsert(rows, { onConflict: 'id' })
    }

    // ========== Snippet Folders PULL ==========
    let foldersQuery = sb.from('snippet_folders').select('*').eq('user_id', userId)
    if (since) {
      foldersQuery = foldersQuery.gt('updated_at', since)
    }
    const { data: remoteFolders } = await foldersQuery

    if (remoteFolders && remoteFolders.length > 0) {
      for (const remote of remoteFolders) {
        const localIdx = store.snippet_folders.findIndex(f => f.id === remote.id)
        const remoteRow: SnippetFolderRow = {
          id: remote.id,
          name: remote.name || '',
          sort_order: remote.sort_order ?? 0,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }
        if (localIdx === -1) {
          store.snippet_folders.push(remoteRow)
        } else {
          const local = store.snippet_folders[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.snippet_folders[localIdx] = remoteRow
          }
        }
      }
    }

    // ========== Snippets PUSH ==========
    const localSnippets = store.snippets.filter(
      sn => !snippetsSince || (sn.updated_at && sn.updated_at > snippetsSince)
    )
    if (localSnippets.length > 0) {
      const rows = localSnippets.map(sn => ({
        id: sn.id,
        user_id: userId,
        folder_id: sn.folder_id || null,
        title: sn.title,
        content: sn.content,
        sort_order: sn.sort_order,
        created_at: sn.created_at,
        updated_at: sn.updated_at || sn.created_at,
        deleted_at: sn.deleted_at || null
      }))
      await sb.from('snippets').upsert(rows, { onConflict: 'id' })
    }

    // ========== Snippets PULL ==========
    let snippetsQuery = sb.from('snippets').select('*').eq('user_id', userId)
    if (since) {
      snippetsQuery = snippetsQuery.gt('updated_at', since)
    }
    const { data: remoteSnippets } = await snippetsQuery

    if (remoteSnippets && remoteSnippets.length > 0) {
      for (const remote of remoteSnippets) {
        const localIdx = store.snippets.findIndex(sn => sn.id === remote.id)
        const remoteRow: SnippetRow = {
          id: remote.id,
          folder_id: remote.folder_id || undefined,
          title: remote.title || '',
          content: remote.content || '',
          sort_order: remote.sort_order ?? 0,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.snippets.push(remoteRow)
        } else {
          const local = store.snippets[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.snippets[localIdx] = remoteRow
          }
        }
      }
    }

    // First-time full push for achievements / badge_events (added in P1).
    const achievementsFirstSync = !store.sync_meta.achievements_synced_once
    const achievementsSince = achievementsFirstSync ? null : since
    const badgeEventsFirstSync = !store.sync_meta.badge_events_synced_once
    const badgeEventsSince = badgeEventsFirstSync ? null : since

    // ========== Achievements PUSH ==========
    const localAchievements = store.achievements.filter(
      a => !achievementsSince || (a.updated_at && a.updated_at > achievementsSince)
    )
    if (localAchievements.length > 0) {
      const rows = localAchievements.map(a => ({
        id: a.id,
        user_id: userId,
        code: a.code,
        unlocked_at: a.unlocked_at,
        progress_snapshot: a.progress_snapshot || null,
        is_silent: a.is_silent,
        created_at: a.created_at,
        updated_at: a.updated_at || a.created_at,
        deleted_at: a.deleted_at || null
      }))
      await sb.from('achievements').upsert(rows, { onConflict: 'id' })
    }

    // ========== Achievements PULL ==========
    let achievementsQuery = sb.from('achievements').select('*').eq('user_id', userId)
    if (since) {
      achievementsQuery = achievementsQuery.gt('updated_at', since)
    }
    const { data: remoteAchievements } = await achievementsQuery

    if (remoteAchievements && remoteAchievements.length > 0) {
      for (const remote of remoteAchievements) {
        const localIdx = store.achievements.findIndex(a => a.id === remote.id)
        const remoteRow: AchievementRow = {
          id: remote.id,
          code: remote.code,
          unlocked_at: remote.unlocked_at,
          progress_snapshot: remote.progress_snapshot || undefined,
          is_silent: remote.is_silent,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.achievements.push(remoteRow)
        } else {
          const local = store.achievements[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.achievements[localIdx] = remoteRow
          }
        }
      }
    }

    // ========== Badge Events PUSH ==========
    const localBadgeEvents = store.badge_events.filter(
      e => !badgeEventsSince || (e.updated_at && e.updated_at > badgeEventsSince)
    )
    if (localBadgeEvents.length > 0) {
      const rows = localBadgeEvents.map(e => ({
        id: e.id,
        user_id: userId,
        event_type: e.event_type,
        habit_id: e.habit_id || null,
        session_id: e.session_id || null,
        card_id: e.card_id || null,
        todo_id: e.todo_id || null,
        started_at: e.started_at || null,
        ended_at: e.ended_at || null,
        active_sec: e.active_sec ?? null,
        payload: e.payload || null,
        created_at: e.created_at,
        updated_at: e.updated_at || e.created_at,
        deleted_at: e.deleted_at || null
      }))
      await sb.from('badge_events').upsert(rows, { onConflict: 'id' })
    }

    // ========== Badge Events PULL ==========
    let badgeEventsQuery = sb.from('badge_events').select('*').eq('user_id', userId)
    if (since) {
      badgeEventsQuery = badgeEventsQuery.gt('updated_at', since)
    }
    const { data: remoteBadgeEvents } = await badgeEventsQuery

    if (remoteBadgeEvents && remoteBadgeEvents.length > 0) {
      for (const remote of remoteBadgeEvents) {
        const localIdx = store.badge_events.findIndex(e => e.id === remote.id)
        const remoteRow: BadgeEventRow = {
          id: remote.id,
          event_type: remote.event_type,
          habit_id: remote.habit_id || undefined,
          session_id: remote.session_id || undefined,
          card_id: remote.card_id || undefined,
          todo_id: remote.todo_id || undefined,
          started_at: remote.started_at || undefined,
          ended_at: remote.ended_at || undefined,
          active_sec: remote.active_sec ?? undefined,
          payload: remote.payload || undefined,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.badge_events.push(remoteRow)
        } else {
          const local = store.badge_events[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.badge_events[localIdx] = remoteRow
          }
        }
      }
    }

    // ========== User Progress PUSH (to profiles row) ==========
    const progress = store.user_progress
    await sb.from('profiles').upsert(
      {
        id: userId,
        level: progress.level,
        xp: progress.xp,
        total_xp: progress.total_xp,
        total_stars: progress.total_stars,
        xp_multiplier: progress.xp_multiplier,
        rebirth_count: progress.rebirth_count,
        // P2b shields
        shields: progress.shields ?? 0,
        shield_month: progress.shield_month ?? '',
        shield_used_this_month: progress.shield_used_this_month ?? 0,
        total_shields_used: progress.total_shields_used ?? 0
      },
      { onConflict: 'id' }
    )

    // ========== User Progress PULL (from profiles row, last-write-wins) ==========
    const { data: remoteProfile } = await sb
      .from('profiles')
      .select(
        'level, xp, total_xp, total_stars, xp_multiplier, rebirth_count, shields, shield_month, shield_used_this_month, total_shields_used'
      )
      .eq('id', userId)
      .maybeSingle()

    if (remoteProfile) {
      const remoteProgress: UserProgress = {
        level: remoteProfile.level ?? 1,
        xp: remoteProfile.xp ?? 0,
        total_xp: remoteProfile.total_xp ?? 0,
        total_stars: remoteProfile.total_stars ?? 0,
        xp_multiplier: remoteProfile.xp_multiplier ?? 1.0,
        rebirth_count: remoteProfile.rebirth_count ?? 0,
        shields: remoteProfile.shields ?? 0,
        shield_month: remoteProfile.shield_month ?? '',
        shield_used_this_month: remoteProfile.shield_used_this_month ?? 0,
        total_shields_used: remoteProfile.total_shields_used ?? 0,
        updated_at: new Date().toISOString()
      }
      // Last-write-wins: prefer remote if it has more total_xp OR higher level
      if (
        remoteProgress.total_xp > progress.total_xp ||
        remoteProgress.level > progress.level
      ) {
        store.user_progress = remoteProgress
      }
    }

    // Update sync timestamp
    store.sync_meta.last_sync_at = new Date().toISOString()
    store.sync_meta.cards_synced_once = true
    store.sync_meta.todos_synced_once = true
    store.sync_meta.achievements_synced_once = true
    store.sync_meta.badge_events_synced_once = true
    store.sync_meta.snippets_synced_once = true
    store.sync_meta.snippet_folders_synced_once = true
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
