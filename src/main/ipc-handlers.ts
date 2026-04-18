import { ipcMain, shell, BrowserWindow } from 'electron'
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
  HabitRow,
  TodoRow
} from './db'
import { signUp, signIn, signOut, getAuthStatus } from './supabase'
import { runSync, getSyncStatus } from './sync'

export function registerIpcHandlers(): void {
  // ====== Habits ======
  ipcMain.handle('habits:list', () => {
    const habits = getAllHabits()
    return habits.map(h => ({
      ...h,
      todaySeconds: getTodayTotalSeconds(h.id),
      streak: getStreak(h.id)
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
      sort_order: data.sort_order || 0
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

  ipcMain.handle('session:stop', (_e, sessionId: string, activeSec: number) => {
    updateSession(sessionId, {
      ended_at: new Date().toISOString(),
      active_sec: activeSec
    })
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
  ipcMain.handle('todos:list', () => {
    return getAllTodos()
  })

  ipcMain.handle('todos:create', (_e, data: { title: string; notes?: string; due_date: string; sort_order?: number }) => {
    return createTodo({
      id: uuidv4(),
      title: data.title,
      notes: data.notes,
      due_date: data.due_date,
      sort_order: data.sort_order
    })
  })

  ipcMain.handle('todos:update', (_e, id: string, updates: Partial<TodoRow>) => {
    return updateTodo(id, updates)
  })

  ipcMain.handle('todos:delete', (_e, id: string) => {
    deleteTodo(id)
    return { ok: true }
  })

  // ====== Window Controls ======
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
