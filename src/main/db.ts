import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// ============ Types ============

export interface HabitRow {
  id: string
  name: string
  icon: string
  target_url: string
  target_app: string
  daily_goal_m: number
  sort_order: number
  is_archived: number
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface SessionRow {
  id: string
  habit_id: string
  started_at: string
  ended_at: string | null
  active_sec: number
  idle_sec: number
  notes: string
  updated_at?: string
}

interface SyncMeta {
  last_sync_at: string | null
  user_id: string | null
}

export interface DeckRow {
  id: string
  name: string
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface CardRow {
  id: string
  deck_id: string
  front: string
  back: string
  review_stage: number       // 0-7, 7 = mastered
  next_review_at: string     // ISO date string (YYYY-MM-DD)
  created_at: string
  updated_at?: string
  deleted_at?: string
}

// Ebbinghaus intervals in days: stage -> days until next review
const EBBINGHAUS_INTERVALS = [0, 1, 2, 4, 7, 15, 30]

interface StoreData {
  habits: HabitRow[]
  sessions: SessionRow[]
  decks: DeckRow[]
  cards: CardRow[]
  sync_meta?: SyncMeta
}

// ============ File I/O ============

let dataDir: string
let store: StoreData

function getDataPath(): string {
  if (!dataDir) {
    dataDir = path.join(app.getPath('userData'), 'data')
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, 'store.json')
}

export function loadStore(): StoreData {
  if (store) return store
  const filePath = getDataPath()
  const empty: StoreData = { habits: [], sessions: [], decks: [], cards: [], sync_meta: { last_sync_at: null, user_id: null } }
  if (fs.existsSync(filePath)) {
    try {
      store = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      // Migrate: backfill updated_at for old records
      for (const h of store.habits) {
        if (!h.updated_at) h.updated_at = h.created_at
      }
      for (const s of store.sessions) {
        if (!s.updated_at) s.updated_at = s.started_at
      }
      if (!store.sync_meta) {
        store.sync_meta = { last_sync_at: null, user_id: null }
      }
      // Migrate: add decks/cards arrays if missing
      if (!store.decks) store.decks = []
      if (!store.cards) store.cards = []
    } catch {
      store = empty
    }
  } else {
    store = empty
  }
  return store
}

export function saveStore(): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(store, null, 2), 'utf-8')
}

// ============ Habits CRUD ============

export function getAllHabits(): HabitRow[] {
  const s = loadStore()
  return s.habits.filter(h => !h.is_archived).sort((a, b) => a.sort_order - b.sort_order)
}

export function createHabit(habit: Omit<HabitRow, 'created_at' | 'is_archived' | 'updated_at'>): HabitRow {
  const s = loadStore()
  const now = new Date().toISOString()
  const row: HabitRow = {
    ...habit,
    is_archived: 0,
    created_at: now,
    updated_at: now
  }
  s.habits.push(row)
  saveStore()
  return row
}

export function updateHabit(id: string, updates: Partial<HabitRow>): HabitRow | undefined {
  const s = loadStore()
  const idx = s.habits.findIndex(h => h.id === id)
  if (idx === -1) return undefined
  s.habits[idx] = { ...s.habits[idx], ...updates, id, updated_at: new Date().toISOString() }
  saveStore()
  return s.habits[idx]
}

export function deleteHabit(id: string): void {
  const s = loadStore()
  const idx = s.habits.findIndex(h => h.id === id)
  if (idx !== -1) {
    const now = new Date().toISOString()
    s.habits[idx].is_archived = 1
    s.habits[idx].deleted_at = now
    s.habits[idx].updated_at = now
    saveStore()
  }
}

// ============ Sessions ============

export function createSession(session: Pick<SessionRow, 'id' | 'habit_id' | 'started_at'>): SessionRow {
  const s = loadStore()
  const row: SessionRow = {
    ...session,
    ended_at: null,
    active_sec: 0,
    idle_sec: 0,
    notes: '',
    updated_at: new Date().toISOString()
  }
  s.sessions.push(row)
  saveStore()
  return row
}

export function updateSession(id: string, updates: Partial<SessionRow>): void {
  const s = loadStore()
  const idx = s.sessions.findIndex(ss => ss.id === id)
  if (idx !== -1) {
    s.sessions[idx] = { ...s.sessions[idx], ...updates, updated_at: new Date().toISOString() }
    saveStore()
  }
}

export function getActiveSession(): SessionRow | undefined {
  const s = loadStore()
  return s.sessions.find(ss => ss.ended_at === null)
}

export function getTodayTotalSeconds(habitId: string): number {
  const s = loadStore()
  const today = new Date().toISOString().slice(0, 10)
  return s.sessions
    .filter(ss => ss.habit_id === habitId && ss.ended_at !== null && ss.started_at.slice(0, 10) === today)
    .reduce((sum, ss) => sum + ss.active_sec, 0)
}

// ============ Streak ============

export function getStreak(habitId: string): number {
  const s = loadStore()
  const habit = s.habits.find(h => h.id === habitId)
  if (!habit) return 0

  const goalSec = habit.daily_goal_m * 60

  const dailyMap: Record<string, number> = {}
  for (const ss of s.sessions) {
    if (ss.habit_id !== habitId || ss.ended_at === null || ss.active_sec <= 0) continue
    const d = ss.started_at.slice(0, 10)
    dailyMap[d] = (dailyMap[d] || 0) + ss.active_sec
  }

  const qualifiedDates = Object.entries(dailyMap)
    .filter(([, sec]) => sec >= goalSec)
    .map(([d]) => d)
    .sort()
    .reverse()

  if (qualifiedDates.length === 0) return 0

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  if (qualifiedDates[0] !== today && qualifiedDates[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < qualifiedDates.length; i++) {
    const prev = new Date(qualifiedDates[i - 1])
    const curr = new Date(qualifiedDates[i])
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000
    if (Math.abs(diffDays - 1) < 0.01) {
      streak++
    } else {
      break
    }
  }
  return streak
}

// ============ Statistics ============

export function getStats(range: 'week' | 'month'): object {
  const s = loadStore()
  const now = new Date()
  const habits = s.habits.filter(h => !h.is_archived)

  let startDate: Date
  if (range === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    startDate = new Date(now)
    startDate.setDate(now.getDate() - diff)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }
  startDate.setHours(0, 0, 0, 0)
  const startStr = startDate.toISOString().slice(0, 10)

  const rangedSessions = s.sessions.filter(
    ss => ss.ended_at !== null && ss.started_at.slice(0, 10) >= startStr
  )

  const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dailyMap: Record<string, number> = {}
  for (const ss of rangedSessions) {
    const d = ss.started_at.slice(0, 10)
    dailyMap[d] = (dailyMap[d] || 0) + ss.active_sec
  }

  const numDays = range === 'week' ? 7 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const weeklyChart: { date: string; label: string; minutes: number }[] = []
  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    const ds = d.toISOString().slice(0, 10)
    const totalSec = dailyMap[ds] || 0
    weeklyChart.push({
      date: ds,
      label: range === 'week' ? dayLabels[d.getDay()] : `${d.getDate()}`,
      minutes: Math.round(totalSec / 60)
    })
  }

  const colors = ['#007AFF', '#AF52DE', '#FF9500', '#34C759', '#FF3B30', '#FF2D55']
  const habitSummaries = habits.map((h, idx) => {
    const total = rangedSessions
      .filter(ss => ss.habit_id === h.id)
      .reduce((sum, ss) => sum + ss.active_sec, 0)
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      totalMinutes: Math.round(total / 60),
      streak: getStreak(h.id),
      color: colors[idx % colors.length]
    }
  }).sort((a, b) => b.totalMinutes - a.totalMinutes)

  const totalMinutes = weeklyChart.reduce((s, d) => s + d.minutes, 0)
  const activeDays = weeklyChart.filter(d => d.minutes > 0).length
  const bestStreak = Math.max(0, ...habits.map(h => getStreak(h.id)))

  return { weeklyChart, habits: habitSummaries, totalMinutes, bestStreak, activeDays }
}

// ============ Decks CRUD ============

export function getAllDecks(): DeckRow[] {
  const s = loadStore()
  return s.decks.filter(d => !d.deleted_at)
}

export function createDeck(deck: Pick<DeckRow, 'id' | 'name'>): DeckRow {
  const s = loadStore()
  const now = new Date().toISOString()
  const row: DeckRow = { ...deck, created_at: now, updated_at: now }
  s.decks.push(row)
  saveStore()
  return row
}

export function updateDeck(id: string, updates: Partial<DeckRow>): DeckRow | undefined {
  const s = loadStore()
  const idx = s.decks.findIndex(d => d.id === id)
  if (idx === -1) return undefined
  s.decks[idx] = { ...s.decks[idx], ...updates, id, updated_at: new Date().toISOString() }
  saveStore()
  return s.decks[idx]
}

export function deleteDeck(id: string): void {
  const s = loadStore()
  const now = new Date().toISOString()
  const idx = s.decks.findIndex(d => d.id === id)
  if (idx !== -1) {
    s.decks[idx].deleted_at = now
    s.decks[idx].updated_at = now
  }
  // Also soft-delete all cards in this deck
  for (const c of s.cards) {
    if (c.deck_id === id && !c.deleted_at) {
      c.deleted_at = now
      c.updated_at = now
    }
  }
  saveStore()
}

// ============ Cards CRUD ============

export function getCardsByDeck(deckId: string): CardRow[] {
  const s = loadStore()
  return s.cards.filter(c => c.deck_id === deckId && !c.deleted_at)
}

export function createCards(cards: Pick<CardRow, 'id' | 'deck_id' | 'front' | 'back'>[]): CardRow[] {
  const s = loadStore()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const rows: CardRow[] = cards.map(c => ({
    ...c,
    review_stage: 0,
    next_review_at: today,
    created_at: now,
    updated_at: now
  }))
  s.cards.push(...rows)
  saveStore()
  return rows
}

export function updateCard(id: string, updates: Partial<CardRow>): CardRow | undefined {
  const s = loadStore()
  const idx = s.cards.findIndex(c => c.id === id)
  if (idx === -1) return undefined
  s.cards[idx] = { ...s.cards[idx], ...updates, id, updated_at: new Date().toISOString() }
  saveStore()
  return s.cards[idx]
}

export function deleteCard(id: string): void {
  const s = loadStore()
  const idx = s.cards.findIndex(c => c.id === id)
  if (idx !== -1) {
    const now = new Date().toISOString()
    s.cards[idx].deleted_at = now
    s.cards[idx].updated_at = now
    saveStore()
  }
}

// ============ Review Logic ============

export function getDueCards(): CardRow[] {
  const s = loadStore()
  const today = new Date().toISOString().slice(0, 10)
  return s.cards.filter(c =>
    !c.deleted_at &&
    c.review_stage < 7 &&
    c.next_review_at <= today
  )
}

export function getDueCardCount(): number {
  return getDueCards().length
}

export function reviewCardRemembered(id: string): void {
  const s = loadStore()
  const idx = s.cards.findIndex(c => c.id === id)
  if (idx === -1) return
  const card = s.cards[idx]
  const newStage = Math.min(card.review_stage + 1, 7)
  const now = new Date()
  let nextReview: string
  if (newStage >= 7) {
    // Mastered - set far future date
    nextReview = '9999-12-31'
  } else {
    const daysToAdd = EBBINGHAUS_INTERVALS[newStage]
    const next = new Date(now)
    next.setDate(next.getDate() + daysToAdd)
    nextReview = next.toISOString().slice(0, 10)
  }
  s.cards[idx] = {
    ...card,
    review_stage: newStage,
    next_review_at: nextReview,
    updated_at: now.toISOString()
  }
  saveStore()
}

export function reviewCardForgot(id: string): void {
  const s = loadStore()
  const idx = s.cards.findIndex(c => c.id === id)
  if (idx === -1) return
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  s.cards[idx] = {
    ...s.cards[idx],
    review_stage: 0,
    next_review_at: today,
    updated_at: now
  }
  saveStore()
}

export function closeDb(): void {
  // No-op for JSON store
}
