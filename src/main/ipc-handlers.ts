import { ipcMain, shell, BrowserWindow, clipboard } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import {
  getAllHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  createSession,
  updateSession,
  getActiveSession,
  getTodayTotalSeconds,
  getStreak,
  getLongestStreak,
  getStats,
  getAllDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  getCardsByDeck,
  createCards,
  updateCard,
  deleteCard,
  getDueCards,
  getDueCardCount,
  reviewCardRemembered,
  reviewCardForgot,
  getAllTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  loadStore,
  saveStore,
  appendBadgeEvent,
  getAllAchievements,
  persistAchievement,
  getUserProgress,
  setUserProgress,
  canRedeemShield,
  createShieldSession,
  wasMissedYesterday,
  currentMonthKey,
  getAllSnippets,
  createSnippet,
  updateSnippet as dbUpdateSnippet,
  deleteSnippet,
  touchSnippet,
  getAllSnippetFolders,
  createSnippetFolder,
  updateSnippetFolder as dbUpdateSnippetFolder,
  deleteSnippetFolder,
  getSettings,
  updateSettings,
  getActiveTodosForBar,
  reorderBarTodos,
  HabitRow,
  TodoRow,
  AchievementRow,
  UserProgress,
  BadgeEventRow,
  SnippetRow,
  SnippetFolderRow
} from './db'
import { signUp, signIn, signOut, getAuthStatus } from './supabase'
import { runSync, getSyncStatus } from './sync'
import { getMainWindow } from './index'
import { toggleHud, hideHud, setHudPinned } from './hud'
import { toggleScratch, hideScratch, setScratchPinned } from './scratch'
import { toggleTasks, hideTasks, setTasksPinned } from './tasks'
import { startTimer, pauseTimer, getActive, getElapsedMap } from './tasks-timer'
import { setSlotHotkey, getRegisteredSlot } from './hotkey'

function broadcastSnippetsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('snippets:changed')
  }
}

function broadcastSnippetFoldersChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('snippet-folders:changed')
  }
}

interface SessionEndOutcome {
  xpGained: number
  newAchievements: AchievementRow[]
  newProgress: UserProgress
}

// Dynamically load achievements evaluator (Agent B). Fallback = no-op if missing.
async function safeEvaluateSessionEnd(
  event: BadgeEventRow
): Promise<SessionEndOutcome> {
  const store = loadStore()
  const currentProgress = getUserProgress()
  try {
    const mod = await import('./achievements')
    if (mod && typeof mod.evaluateSessionEnd === 'function') {
      const outcome = mod.evaluateSessionEnd(store, event)
      return {
        xpGained: outcome?.xpGained ?? 0,
        newAchievements: outcome?.newAchievements ?? [],
        newProgress: outcome?.newProgress ?? currentProgress
      }
    }
  } catch {
    // Agent B's achievements module not yet available — fall through to fallback.
  }
  return {
    xpGained: 0,
    newAchievements: [],
    newProgress: currentProgress
  }
}

export function registerIpcHandlers(): void {
  // P2b: on app startup, roll the shield month over if the calendar month
  // has changed since we last wrote progress. Keeps shield_used_this_month
  // honest even if the user didn't redeem anything last month.
  try {
    const p = getUserProgress()
    const month = currentMonthKey()
    if (p.shield_month !== month) {
      setUserProgress({
        ...p,
        shield_month: month,
        shield_used_this_month: 0,
        updated_at: new Date().toISOString()
      })
    }
  } catch {
    // Non-fatal: first-run or corrupted store will self-heal on the next write.
  }

  // ====== Habits ======
  ipcMain.handle('habits:list', () => {
    const habits = getAllHabits()
    return habits.map(h => ({
      ...h,
      todaySeconds: getTodayTotalSeconds(h.id),
      streak: getStreak(h.id),
      longestStreak: getLongestStreak(h.id),
      // P2b: true if yesterday's active_sec for this habit was below daily goal.
      missedYesterday: wasMissedYesterday(h.id)
    }))
  })

  ipcMain.handle('habits:create', (_e, data: Partial<HabitRow>) => {
    return createHabit({
      id: uuidv4(),
      name: data.name || 'New Habit',
      icon: data.icon || 'target',
      target_url: data.target_url || '',
      target_app: data.target_app || '',
      daily_goal_m: data.daily_goal_m || 30,
      sort_order: data.sort_order || 0,
      category: typeof data.category === 'string' ? data.category : 'uncategorized'
    })
  })

  ipcMain.handle('habits:update', (_e, id: string, updates: Partial<HabitRow>) => {
    return updateHabit(id, updates)
  })

  ipcMain.handle('habits:delete', (_e, id: string) => {
    deleteHabit(id)
    return { ok: true }
  })

  // ====== Sessions ======
  ipcMain.handle('session:start', (_e, habitId: string) => {
    const active = getActiveSession()
    if (active) {
      updateSession(active.id, { ended_at: new Date().toISOString() })
    }

    const session = createSession({
      id: uuidv4(),
      habit_id: habitId,
      started_at: new Date().toISOString()
    })

    const habits = getAllHabits()
    const habit = habits.find(h => h.id === habitId)
    if (habit) {
      if (habit.target_url) {
        shell.openExternal(habit.target_url)
      } else if (habit.target_app) {
        exec(`"${habit.target_app}"`, { windowsHide: false })
      }
    }

    return session
  })

  ipcMain.handle('session:stop', async (_e, sessionId: string, activeSec: number) => {
    const endedAt = new Date().toISOString()
    updateSession(sessionId, {
      ended_at: endedAt,
      active_sec: activeSec
    })

    // Locate the just-ended session in the store to build a badge event
    const store = loadStore()
    const session = store.sessions.find(s => s.id === sessionId)
    if (!session) return { ok: true }

    const event = appendBadgeEvent({
      event_type: 'session_end',
      habit_id: session.habit_id,
      session_id: session.id,
      started_at: session.started_at,
      ended_at: session.ended_at ?? endedAt,
      active_sec: activeSec
    })

    const outcome = await safeEvaluateSessionEnd(event)
    for (const ach of outcome.newAchievements) persistAchievement(ach)
    setUserProgress(outcome.newProgress)
    saveStore()

    const win = getMainWindow()
    win?.webContents.send('progress:updated', outcome.newProgress)
    for (const ach of outcome.newAchievements) {
      win?.webContents.send('achievement:unlocked', ach)
    }

    return { ok: true }
  })

  ipcMain.handle('session:tick', (_e, sessionId: string, activeSec: number, idleSec: number) => {
    updateSession(sessionId, { active_sec: activeSec, idle_sec: idleSec })
  })

  ipcMain.handle('session:active', () => {
    return getActiveSession() || null
  })

  // ====== Stats ======
  ipcMain.handle('stats:get', (_e, range: 'week' | 'month') => {
    return getStats(range)
  })

  // ====== Auth ======
  ipcMain.handle('auth:login', (_e, email: string, password: string) => {
    return signIn(email, password)
  })

  ipcMain.handle('auth:register', (_e, email: string, password: string) => {
    return signUp(email, password)
  })

  ipcMain.handle('auth:logout', async () => {
    await signOut()
    return { ok: true }
  })

  ipcMain.handle('auth:status', () => {
    return getAuthStatus()
  })

  // ====== Sync ======
  ipcMain.handle('sync:trigger', async () => {
    await runSync()
    return { ok: true }
  })

  ipcMain.handle('sync:status', () => {
    return getSyncStatus()
  })

  // ====== Decks ======
  ipcMain.handle('decks:list', () => {
    return getAllDecks()
  })

  ipcMain.handle('decks:create', (_e, data: { id: string; name: string }) => {
    return createDeck(data)
  })

  ipcMain.handle('decks:update', (_e, id: string, updates: { name?: string }) => {
    return updateDeck(id, updates)
  })

  ipcMain.handle('decks:delete', (_e, id: string) => {
    deleteDeck(id)
    return { ok: true }
  })

  // ====== Cards ======
  ipcMain.handle('cards:list', (_e, deckId: string) => {
    return getCardsByDeck(deckId)
  })

  ipcMain.handle('cards:create-batch', (_e, cards: { id: string; deck_id: string; front: string; back: string }[]) => {
    return createCards(cards)
  })

  ipcMain.handle('cards:update', (_e, id: string, updates: { front?: string; back?: string }) => {
    return updateCard(id, updates)
  })

  ipcMain.handle('cards:delete', (_e, id: string) => {
    deleteCard(id)
    return { ok: true }
  })

  // ====== Review ======
  ipcMain.handle('review:due', () => {
    return getDueCards()
  })

  ipcMain.handle('review:due-count', () => {
    return getDueCardCount()
  })

  ipcMain.handle('review:remembered', (_e, cardId: string) => {
    reviewCardRemembered(cardId)
    return { ok: true }
  })

  ipcMain.handle('review:forgot', (_e, cardId: string) => {
    reviewCardForgot(cardId)
    return { ok: true }
  })

  // ====== Todos ======
  // Broadcast any todo mutation so every open window (main TodosPage +
  // floating tasks bar) can refresh — the tasks bar IS the todos list now.
  function broadcastTodosChanged(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('tasks:todos-changed')
    }
  }

  ipcMain.handle('todos:list', () => {
    return getAllTodos()
  })

  ipcMain.handle('todos:create', (_e, data: { title: string; notes?: string; due_date: string; sort_order?: number }) => {
    const row = createTodo({
      id: uuidv4(),
      title: data.title,
      notes: data.notes,
      due_date: data.due_date,
      sort_order: data.sort_order
    })
    broadcastTodosChanged()
    return row
  })

  ipcMain.handle('todos:update', (_e, id: string, updates: Partial<TodoRow>) => {
    const row = updateTodo(id, updates)
    broadcastTodosChanged()
    return row
  })

  ipcMain.handle('todos:delete', (_e, id: string) => {
    deleteTodo(id)
    broadcastTodosChanged()
    return { ok: true }
  })

  // ====== Progress & Achievements ======
  ipcMain.handle('progress:get', () => {
    return getUserProgress()
  })

  ipcMain.handle('achievements:list', () => {
    return getAllAchievements()
  })

  ipcMain.handle('achievements:recompute', async () => {
    try {
      const mod = await import('./achievements')
      if (mod && typeof mod.recomputeAll === 'function') {
        const outcome = mod.recomputeAll(loadStore())
        if (outcome?.newAchievements) {
          for (const ach of outcome.newAchievements) persistAchievement(ach)
        }
        if (outcome?.newProgress) {
          setUserProgress(outcome.newProgress)
        }
        saveStore()

        const win = getMainWindow()
        const progress = getUserProgress()
        win?.webContents.send('progress:updated', progress)
        for (const ach of outcome?.newAchievements ?? []) {
          win?.webContents.send('achievement:unlocked', ach)
        }
        return { ok: true, progress, unlocked: outcome?.newAchievements ?? [] }
      }
    } catch {
      // Agent B module not available
    }
    return { ok: false, progress: getUserProgress(), unlocked: [] }
  })

  // ====== P2b Star Shield ======
  ipcMain.handle('shield:redeem', async (_e, habitId: string) => {
    // 1. Must hold a shield and not be over the monthly cap.
    const progress = getUserProgress()
    const guard = canRedeemShield(progress)
    if (!guard.ok) {
      return { ok: false, reason: guard.reason }
    }

    // 2. The targeted habit must actually have missed yesterday.
    if (!wasMissedYesterday(habitId)) {
      return { ok: false, reason: '昨天没有缺打该习惯，不需要使用星辰盾' }
    }

    // 3. Compute yesterday's local date and build the shield session.
    const now = new Date()
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const yyyy = y.getFullYear()
    const mm = String(y.getMonth() + 1).padStart(2, '0')
    const dd = String(y.getDate()).padStart(2, '0')
    const missedDate = `${yyyy}-${mm}-${dd}`

    const store = loadStore()
    const shieldSession = createShieldSession(habitId, missedDate)
    store.sessions.push(shieldSession)

    // 4. Emit a badge event marking this as a shielded session.
    const event = appendBadgeEvent({
      event_type: 'session_end',
      habit_id: shieldSession.habit_id,
      session_id: shieldSession.id,
      started_at: shieldSession.started_at,
      ended_at: shieldSession.ended_at ?? undefined,
      active_sec: shieldSession.active_sec,
      payload: JSON.stringify({ shielded: true, missedDate })
    })

    // 5. Decrement shield inventory, bump monthly & lifetime counters.
    //    If the stored shield_month is stale, reset it first.
    const month = currentMonthKey()
    const usedThisMonth =
      progress.shield_month === month ? (progress.shield_used_this_month ?? 0) : 0
    const nextProgress: UserProgress = {
      ...progress,
      shields: Math.max(0, (progress.shields ?? 0) - 1),
      shield_month: month,
      shield_used_this_month: usedThisMonth + 1,
      total_shields_used: (progress.total_shields_used ?? 0) + 1,
      updated_at: new Date().toISOString()
    }
    setUserProgress(nextProgress)

    // 6. Let Agent B's engine process the shielded session (may unlock
    //    achievements such as "first-shield-used" without awarding XP twice).
    const outcome = await safeEvaluateSessionEnd(event)
    for (const ach of outcome.newAchievements) persistAchievement(ach)
    // The engine returns its own newProgress; shield bookkeeping we just wrote
    // must survive. Merge: engine wins on level/xp/totals, shield fields we keep.
    const finalProgress: UserProgress = {
      ...outcome.newProgress,
      shields: nextProgress.shields,
      shield_month: nextProgress.shield_month,
      shield_used_this_month: nextProgress.shield_used_this_month,
      total_shields_used: nextProgress.total_shields_used,
      updated_at: new Date().toISOString()
    }
    setUserProgress(finalProgress)
    saveStore()

    // 7. Notify renderer.
    const win = getMainWindow()
    win?.webContents.send('progress:updated', finalProgress)
    for (const ach of outcome.newAchievements) {
      win?.webContents.send('achievement:unlocked', ach)
    }

    return { ok: true, progress: finalProgress }
  })

  // ====== Snippet Folders (速贴分组) ======
  ipcMain.handle('snippet-folders:list', () => {
    return getAllSnippetFolders()
  })

  ipcMain.handle(
    'snippet-folders:create',
    (_e, data: { name: string; sort_order?: number }) => {
      const row = createSnippetFolder({
        id: uuidv4(),
        name: data.name || '未命名',
        sort_order: data.sort_order
      })
      broadcastSnippetFoldersChanged()
      return row
    }
  )

  ipcMain.handle(
    'snippet-folders:update',
    (_e, id: string, updates: Partial<SnippetFolderRow>) => {
      const row = dbUpdateSnippetFolder(id, updates)
      broadcastSnippetFoldersChanged()
      return row
    }
  )

  ipcMain.handle('snippet-folders:delete', (_e, id: string) => {
    deleteSnippetFolder(id)
    broadcastSnippetFoldersChanged()
    // Folder delete cascades to snippets — let the HUD/Settings page refresh both.
    broadcastSnippetsChanged()
    return { ok: true }
  })

  // ====== Snippets (快速粘贴 HUD) ======
  ipcMain.handle('snippets:list', (_e, folderId?: string) => {
    return getAllSnippets(folderId)
  })

  ipcMain.handle(
    'snippets:create',
    (_e, data: { title?: string; content: string; folder_id?: string; sort_order?: number }) => {
      const row = createSnippet({
        id: uuidv4(),
        folder_id: data.folder_id,
        title: data.title || '',
        content: data.content || '',
        sort_order: data.sort_order
      })
      broadcastSnippetsChanged()
      return row
    }
  )

  ipcMain.handle('snippets:update', (_e, id: string, updates: Partial<SnippetRow>) => {
    const row = dbUpdateSnippet(id, updates)
    broadcastSnippetsChanged()
    return row
  })

  ipcMain.handle('snippets:delete', (_e, id: string) => {
    deleteSnippet(id)
    broadcastSnippetsChanged()
    return { ok: true }
  })

  ipcMain.handle('snippets:copy', (_e, id: string) => {
    const all = getAllSnippets()
    const target = all.find(sn => sn.id === id)
    if (!target) return { ok: false, reason: 'not found' }
    clipboard.writeText(target.content)
    // Bumping updated_at keeps recently-used snippets sortable if we ever want MRU order.
    touchSnippet(id)
    broadcastSnippetsChanged()
    return { ok: true }
  })

  // ====== HUD Window ======
  ipcMain.handle('hud:toggle', () => {
    toggleHud()
  })

  ipcMain.handle('hud:hide', () => {
    hideHud()
  })

  ipcMain.handle('hud:get-pinned', () => {
    return getSettings().hudPinned === true
  })

  ipcMain.handle('hud:set-pinned', (_e, pinned: boolean) => {
    setHudPinned(!!pinned)
    // Broadcast so both main window (Settings page) and HUD stay in sync.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('hud:pinned-changed', !!pinned)
    }
    return { ok: true }
  })

  // ====== Settings (hotkey) ======
  ipcMain.handle('settings:get-hotkey', () => {
    return getSettings().hudHotkey ?? ''
  })

  ipcMain.handle('settings:set-hotkey', (_e, accel: string) => {
    const outcome = setSlotHotkey('hud', accel)
    if (!outcome.ok) {
      const win = getMainWindow()
      win?.webContents.send('hotkey:conflict', { accel, error: outcome.error })
    }
    return { ...outcome, active: getRegisteredSlot('hud') }
  })

  // ====== Scratch Window ======
  ipcMain.handle('scratch:toggle', () => {
    toggleScratch()
  })

  ipcMain.handle('scratch:hide', () => {
    hideScratch()
  })

  ipcMain.handle('scratch:get-pinned', () => {
    return getSettings().scratchPinned === true
  })

  ipcMain.handle('scratch:set-pinned', (_e, pinned: boolean) => {
    setScratchPinned(!!pinned)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('scratch:pinned-changed', !!pinned)
    }
    return { ok: true }
  })

  ipcMain.handle('scratch:get-draft', () => {
    return getSettings().scratchDraft ?? ''
  })

  ipcMain.handle('scratch:set-draft', (_e, draft: string) => {
    updateSettings({ scratchDraft: typeof draft === 'string' ? draft : '' })
    return { ok: true }
  })

  ipcMain.handle('settings:get-scratch-hotkey', () => {
    return getSettings().scratchHotkey ?? ''
  })

  ipcMain.handle('settings:set-scratch-hotkey', (_e, accel: string) => {
    const outcome = setSlotHotkey('scratch', accel)
    if (!outcome.ok) {
      const win = getMainWindow()
      win?.webContents.send('hotkey:conflict', { accel, error: outcome.error })
    }
    return { ...outcome, active: getRegisteredSlot('scratch') }
  })

  // ====== Tasks Progress Bar ======
  ipcMain.handle('tasks:toggle', () => {
    toggleTasks()
  })

  ipcMain.handle('tasks:hide', () => {
    hideTasks()
  })

  ipcMain.handle('tasks:get-pinned', () => {
    return getSettings().tasksPinned === true
  })

  ipcMain.handle('tasks:set-pinned', (_e, pinned: boolean) => {
    setTasksPinned(!!pinned)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('tasks:pinned-changed', !!pinned)
    }
    return { ok: true }
  })

  ipcMain.handle('tasks:list-todos', () => {
    return getActiveTodosForBar()
  })

  ipcMain.handle('tasks:reorder', (_e, ids: string[]) => {
    if (!Array.isArray(ids)) return { ok: false }
    reorderBarTodos(ids)
    broadcastTodosChanged()
    return { ok: true }
  })

  ipcMain.handle('tasks:get-elapsed-map', () => {
    return getElapsedMap()
  })

  ipcMain.handle('tasks:start', (_e, todoId: string) => {
    startTimer(todoId)
    return { ok: true }
  })

  ipcMain.handle('tasks:pause', () => {
    pauseTimer()
    return { ok: true }
  })

  ipcMain.handle('tasks:get-active', () => {
    return getActive()
  })

  ipcMain.handle('settings:get-tasks-hotkey', () => {
    return getSettings().tasksHotkey ?? ''
  })

  ipcMain.handle('settings:set-tasks-hotkey', (_e, accel: string) => {
    const outcome = setSlotHotkey('tasks', accel)
    if (!outcome.ok) {
      const win = getMainWindow()
      win?.webContents.send('hotkey:conflict', { accel, error: outcome.error })
    }
    return { ...outcome, active: getRegisteredSlot('tasks') }
  })

  // ====== Window Controls ======
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    // Snippet HUD should just hide on close-button click, not exit the whole thing.
    const sender = BrowserWindow.fromWebContents(e.sender)
    if (!sender) return
    const main = getMainWindow()
    if (main && sender.id !== main.id) {
      sender.hide()
      return
    }
    sender.close()
  })
}
