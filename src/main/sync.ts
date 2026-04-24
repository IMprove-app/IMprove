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
  SnippetFolderRow,
  TaskSessionRow
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

interface WatermarkStore {
  sync_meta?: {
    pull_watermarks?: Record<string, string>
    push_watermarks?: Record<string, string>
  }
}

function getPullWatermark(store: WatermarkStore, table: string): string | null {
  return store.sync_meta?.pull_watermarks?.[table] ?? null
}

function advancePullWatermark(
  store: WatermarkStore,
  table: string,
  rows: ReadonlyArray<{ updated_at?: string | null }> | null | undefined
): void {
  if (!rows || rows.length === 0) return
  if (!store.sync_meta) return
  if (!store.sync_meta.pull_watermarks) store.sync_meta.pull_watermarks = {}
  let max = store.sync_meta.pull_watermarks[table] || ''
  for (const r of rows) {
    const t = r.updated_at || ''
    if (t > max) max = t
  }
  if (max) store.sync_meta.pull_watermarks[table] = max
}

function getPushWatermark(store: WatermarkStore, table: string): string | null {
  return store.sync_meta?.push_watermarks?.[table] ?? null
}

/**
 * Advance the push watermark to the max `updated_at` of the rows we just pushed.
 * Call ONLY after confirming the upsert succeeded (no error returned).
 * A silent failure path that skips this call is what makes retry automatic.
 */
function advancePushWatermark(
  store: WatermarkStore,
  table: string,
  rows: ReadonlyArray<{ updated_at?: string | null }>
): void {
  if (!rows || rows.length === 0) return
  if (!store.sync_meta) return
  if (!store.sync_meta.push_watermarks) store.sync_meta.push_watermarks = {}
  let max = store.sync_meta.push_watermarks[table] || ''
  for (const r of rows) {
    const t = r.updated_at || ''
    if (t > max) max = t
  }
  if (max) store.sync_meta.push_watermarks[table] = max
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

    // ========== PUSH phase (filtered by per-table push_watermarks) ==========

    // Push habits
    const habitsPushWatermark = getPushWatermark(store, 'habits')
    const localHabits = store.habits.filter(
      h => !habitsPushWatermark || (h.updated_at && h.updated_at > habitsPushWatermark)
    )
    if (localHabits.length > 0) {
      const habitRows = localHabits.map(h => ({
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
      const { error: habitsErr } = await sb.from('habits').upsert(habitRows, { onConflict: 'id' })
      if (habitsErr) console.error('sync push failed: habits', habitsErr)
      else advancePushWatermark(store, 'habits', habitRows)
    }

    // Push completed sessions (not active ones)
    const sessionsPushWatermark = getPushWatermark(store, 'sessions')
    const localSessions = store.sessions.filter(
      s =>
        s.ended_at !== null &&
        (!sessionsPushWatermark || (s.updated_at && s.updated_at > sessionsPushWatermark))
    )
    if (localSessions.length > 0) {
      const sessionRows = localSessions.map(s => ({
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
      const { error: sessionsErr } = await sb.from('sessions').upsert(sessionRows, { onConflict: 'id' })
      if (sessionsErr) console.error('sync push failed: sessions', sessionsErr)
      else advancePushWatermark(store, 'sessions', sessionRows)
    }

    // ========== PULL phase ==========

    // Pull remote habits
    const habitsWatermark = getPullWatermark(store, 'habits')
    let habitsQuery = sb.from('habits').select('*').eq('user_id', userId)
    if (habitsWatermark) {
      habitsQuery = habitsQuery.gt('updated_at', habitsWatermark)
    }
    const { data: remoteHabits } = await habitsQuery
    advancePullWatermark(store, 'habits', remoteHabits)

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
    const sessionsWatermark = getPullWatermark(store, 'sessions')
    let sessionsQuery = sb.from('sessions').select('*').eq('user_id', userId)
    if (sessionsWatermark) {
      sessionsQuery = sessionsQuery.gt('updated_at', sessionsWatermark)
    }
    const { data: remoteSessions } = await sessionsQuery
    advancePullWatermark(store, 'sessions', remoteSessions)

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

    // ========== Decks PUSH ==========
    const decksPushWatermark = getPushWatermark(store, 'decks')
    const localDecks = store.decks.filter(
      d => !decksPushWatermark || (d.updated_at && d.updated_at > decksPushWatermark)
    )
    if (localDecks.length > 0) {
      const deckRows = localDecks.map(d => ({
        id: d.id,
        user_id: userId,
        name: d.name,
        created_at: d.created_at,
        updated_at: d.updated_at || d.created_at,
        deleted_at: d.deleted_at || null
      }))
      const { error: decksErr } = await sb.from('decks').upsert(deckRows, { onConflict: 'id' })
      if (decksErr) console.error('sync push failed: decks', decksErr)
      else advancePushWatermark(store, 'decks', deckRows)
    }

    // ========== Cards PUSH ==========
    const cardsPushWatermark = getPushWatermark(store, 'cards')
    const localCards = store.cards.filter(
      c => !cardsPushWatermark || (c.updated_at && c.updated_at > cardsPushWatermark)
    )
    if (localCards.length > 0) {
      const cardRows = localCards.map(c => ({
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
      const { error: cardsErr } = await sb.from('cards').upsert(cardRows, { onConflict: 'id' })
      if (cardsErr) console.error('sync push failed: cards', cardsErr)
      else advancePushWatermark(store, 'cards', cardRows)
    }

    // ========== Decks PULL ==========
    const decksWatermark = getPullWatermark(store, 'decks')
    let decksQuery = sb.from('decks').select('*').eq('user_id', userId)
    if (decksWatermark) {
      decksQuery = decksQuery.gt('updated_at', decksWatermark)
    }
    const { data: remoteDecks } = await decksQuery
    advancePullWatermark(store, 'decks', remoteDecks)

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
    const cardsWatermark = getPullWatermark(store, 'cards')
    let cardsQuery = sb.from('cards').select('*').eq('user_id', userId)
    if (cardsWatermark) {
      cardsQuery = cardsQuery.gt('updated_at', cardsWatermark)
    }
    const { data: remoteCards } = await cardsQuery
    advancePullWatermark(store, 'cards', remoteCards)

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

    // ========== Todos PUSH ==========
    const todosPushWatermark = getPushWatermark(store, 'todos')
    const localTodos = store.todos.filter(
      t => !todosPushWatermark || (t.updated_at && t.updated_at > todosPushWatermark)
    )
    if (localTodos.length > 0) {
      const todoRows = localTodos.map(t => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        notes: t.notes || '',
        due_date: t.due_date,
        is_done: t.is_done,
        completed_at: t.completed_at || null,
        sort_order: t.sort_order,
        in_tasks_bar: t.in_tasks_bar ?? 0,
        created_at: t.created_at,
        updated_at: t.updated_at || t.created_at,
        deleted_at: t.deleted_at || null
      }))
      const { error: todosErr } = await sb.from('todos').upsert(todoRows, { onConflict: 'id' })
      if (todosErr) console.error('sync push failed: todos', todosErr)
      else advancePushWatermark(store, 'todos', todoRows)
    }

    // ========== Todos PULL ==========
    const todosWatermark = getPullWatermark(store, 'todos')
    let todosQuery = sb.from('todos').select('*').eq('user_id', userId)
    if (todosWatermark) {
      todosQuery = todosQuery.gt('updated_at', todosWatermark)
    }
    const { data: remoteTodos } = await todosQuery
    advancePullWatermark(store, 'todos', remoteTodos)

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
          in_tasks_bar: remote.in_tasks_bar ?? 0,
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

    // ========== Task Sessions PUSH (only completed — ended_at != null) ==========
    const taskSessionsPushWatermark = getPushWatermark(store, 'task_sessions')
    const localTaskSessions = store.task_sessions.filter(
      r =>
        r.ended_at != null &&
        (!taskSessionsPushWatermark ||
          (r.updated_at && r.updated_at > taskSessionsPushWatermark))
    )
    if (localTaskSessions.length > 0) {
      const taskSessionRows = localTaskSessions.map(r => ({
        id: r.id,
        user_id: userId,
        todo_id: r.todo_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        active_sec: r.active_sec,
        created_at: r.created_at,
        updated_at: r.updated_at || r.created_at,
        deleted_at: r.deleted_at || null
      }))
      const { error: taskSessionsErr } = await sb
        .from('task_sessions')
        .upsert(taskSessionRows, { onConflict: 'id' })
      if (taskSessionsErr) console.error('sync push failed: task_sessions', taskSessionsErr)
      else advancePushWatermark(store, 'task_sessions', taskSessionRows)
    }

    // ========== Task Sessions PULL ==========
    const taskSessionsWatermark = getPullWatermark(store, 'task_sessions')
    let taskSessionsQuery = sb.from('task_sessions').select('*').eq('user_id', userId)
    if (taskSessionsWatermark) {
      taskSessionsQuery = taskSessionsQuery.gt('updated_at', taskSessionsWatermark)
    }
    const { data: remoteTaskSessions } = await taskSessionsQuery
    advancePullWatermark(store, 'task_sessions', remoteTaskSessions)

    if (remoteTaskSessions && remoteTaskSessions.length > 0) {
      for (const remote of remoteTaskSessions) {
        const localIdx = store.task_sessions.findIndex(r => r.id === remote.id)
        const remoteRow: TaskSessionRow = {
          id: remote.id,
          todo_id: remote.todo_id,
          started_at: remote.started_at,
          ended_at: remote.ended_at || undefined,
          active_sec: remote.active_sec ?? 0,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          deleted_at: remote.deleted_at || undefined
        }

        if (localIdx === -1) {
          store.task_sessions.push(remoteRow)
        } else {
          const local = store.task_sessions[localIdx]
          const localTime = local.updated_at || local.created_at
          const remoteTime = remote.updated_at || remote.created_at
          if (remoteTime > localTime) {
            store.task_sessions[localIdx] = remoteRow
          }
        }
      }
    }

    // ========== Snippet Folders PUSH ==========
    const snippetFoldersPushWatermark = getPushWatermark(store, 'snippet_folders')
    const localFolders = store.snippet_folders.filter(
      f =>
        !snippetFoldersPushWatermark ||
        (f.updated_at && f.updated_at > snippetFoldersPushWatermark)
    )
    if (localFolders.length > 0) {
      const folderRows = localFolders.map(f => ({
        id: f.id,
        user_id: userId,
        name: f.name,
        sort_order: f.sort_order,
        created_at: f.created_at,
        updated_at: f.updated_at || f.created_at,
        deleted_at: f.deleted_at || null
      }))
      const { error: foldersErr } = await sb
        .from('snippet_folders')
        .upsert(folderRows, { onConflict: 'id' })
      if (foldersErr) console.error('sync push failed: snippet_folders', foldersErr)
      else advancePushWatermark(store, 'snippet_folders', folderRows)
    }

    // ========== Snippet Folders PULL ==========
    const foldersWatermark = getPullWatermark(store, 'snippet_folders')
    let foldersQuery = sb.from('snippet_folders').select('*').eq('user_id', userId)
    if (foldersWatermark) {
      foldersQuery = foldersQuery.gt('updated_at', foldersWatermark)
    }
    const { data: remoteFolders } = await foldersQuery
    advancePullWatermark(store, 'snippet_folders', remoteFolders)

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
    const snippetsPushWatermark = getPushWatermark(store, 'snippets')
    const localSnippets = store.snippets.filter(
      sn =>
        !snippetsPushWatermark || (sn.updated_at && sn.updated_at > snippetsPushWatermark)
    )
    if (localSnippets.length > 0) {
      const snippetRows = localSnippets.map(sn => ({
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
      const { error: snippetsErr } = await sb
        .from('snippets')
        .upsert(snippetRows, { onConflict: 'id' })
      if (snippetsErr) console.error('sync push failed: snippets', snippetsErr)
      else advancePushWatermark(store, 'snippets', snippetRows)
    }

    // ========== Snippets PULL ==========
    const snippetsWatermark = getPullWatermark(store, 'snippets')
    let snippetsQuery = sb.from('snippets').select('*').eq('user_id', userId)
    if (snippetsWatermark) {
      snippetsQuery = snippetsQuery.gt('updated_at', snippetsWatermark)
    }
    const { data: remoteSnippets } = await snippetsQuery
    advancePullWatermark(store, 'snippets', remoteSnippets)

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

    // ========== Achievements PUSH ==========
    const achievementsPushWatermark = getPushWatermark(store, 'achievements')
    const localAchievements = store.achievements.filter(
      a =>
        !achievementsPushWatermark ||
        (a.updated_at && a.updated_at > achievementsPushWatermark)
    )
    if (localAchievements.length > 0) {
      const achievementRows = localAchievements.map(a => ({
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
      const { error: achievementsErr } = await sb
        .from('achievements')
        .upsert(achievementRows, { onConflict: 'id' })
      if (achievementsErr) console.error('sync push failed: achievements', achievementsErr)
      else advancePushWatermark(store, 'achievements', achievementRows)
    }

    // ========== Achievements PULL ==========
    const achievementsWatermark = getPullWatermark(store, 'achievements')
    let achievementsQuery = sb.from('achievements').select('*').eq('user_id', userId)
    if (achievementsWatermark) {
      achievementsQuery = achievementsQuery.gt('updated_at', achievementsWatermark)
    }
    const { data: remoteAchievements } = await achievementsQuery
    advancePullWatermark(store, 'achievements', remoteAchievements)

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
    const badgeEventsPushWatermark = getPushWatermark(store, 'badge_events')
    const localBadgeEvents = store.badge_events.filter(
      e =>
        !badgeEventsPushWatermark ||
        (e.updated_at && e.updated_at > badgeEventsPushWatermark)
    )
    if (localBadgeEvents.length > 0) {
      const badgeRows = localBadgeEvents.map(e => ({
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
      const { error: badgeErr } = await sb
        .from('badge_events')
        .upsert(badgeRows, { onConflict: 'id' })
      if (badgeErr) console.error('sync push failed: badge_events', badgeErr)
      else advancePushWatermark(store, 'badge_events', badgeRows)
    }

    // ========== Badge Events PULL ==========
    const badgeEventsWatermark = getPullWatermark(store, 'badge_events')
    let badgeEventsQuery = sb.from('badge_events').select('*').eq('user_id', userId)
    if (badgeEventsWatermark) {
      badgeEventsQuery = badgeEventsQuery.gt('updated_at', badgeEventsWatermark)
    }
    const { data: remoteBadgeEvents } = await badgeEventsQuery
    advancePullWatermark(store, 'badge_events', remoteBadgeEvents)

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

    // Update wall-clock sync timestamp for display purposes. Push/pull filters
    // no longer rely on this — see push_watermarks / pull_watermarks above.
    // Legacy *_synced_once flags remain on the store for back-compat but are
    // ignored by the new watermark-based logic.
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
