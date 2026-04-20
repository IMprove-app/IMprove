import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

// ============ Types ============

// Habit category (P2a). Stored as string at runtime for forward compatibility.
export type HabitCategory =
  | 'uncategorized'
  | 'health'      // 健康
  | 'learning'    // 学习
  | 'emotion'     // 情绪
  | 'creation'    // 创造
  | 'relation'    // 关系

const VALID_HABIT_CATEGORIES: ReadonlySet<string> = new Set([
  'uncategorized',
  'health',
  'learning',
  'emotion',
  'creation',
  'relation'
])

function normalizeCategory(value: unknown): string {
  if (typeof value === 'string' && VALID_HABIT_CATEGORIES.has(value)) {
    return value
  }
  return 'uncategorized'
}

export interface HabitRow {
  id: string
  name: string
  icon: string
  target_url: string
  target_app: string
  daily_goal_m: number
  sort_order: number
  is_archived: number
  category: string
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
  /** P2b: 1 if this session was created by a Star Shield (shield:redeem) to cover a missed day. */
  is_shield?: number
}

interface SyncMeta {
  last_sync_at: string | null
  user_id: string | null
  cards_synced_once?: boolean
  todos_synced_once?: boolean
  achievements_synced_once?: boolean
  badge_events_synced_once?: boolean
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

export interface TodoRow {
  id: string
  title: string
  notes: string
  due_date: string
  is_done: number
  completed_at?: string
  sort_order: number
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface BadgeEventRow {
  id: string                 // uuid
  event_type: 'session_end' | 'card_review' | 'todo_complete'
  habit_id?: string
  session_id?: string
  card_id?: string
  todo_id?: string
  started_at?: string        // ISO
  ended_at?: string          // ISO
  active_sec?: number
  payload?: string           // JSON string for extra context
  created_at: string         // ISO
  updated_at?: string
  deleted_at?: string
}

export interface AchievementRow {
  id: string                 // uuid
  code: string               // stable key
  unlocked_at: string        // ISO
  progress_snapshot?: string // JSON string
  is_silent: number          // 0=normal, 1=silent (retroactive)
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface UserProgress {
  level: number              // 1-20 cap for P1 (field supports 1-160 future)
  xp: number                 // XP within current level
  total_xp: number           // lifetime XP
  total_stars: number        // lifetime stars earned (== total_xp for now)
  xp_multiplier: number      // 1.0 default
  rebirth_count: number      // 0 for P1
  // P2b Star Shields:
  shields: number                 // current shields held, 0-3
  shield_month: string            // 'YYYY-MM' in local tz; when month changes, reset shield_used_this_month
  shield_used_this_month: number  // 0-2
  total_shields_used: number      // lifetime shield redemptions, used for achievements
  updated_at: string
}

function defaultUserProgress(): UserProgress {
  return {
    level: 1,
    xp: 0,
    total_xp: 0,
    total_stars: 0,
    xp_multiplier: 1.0,
    rebirth_count: 0,
    shields: 0,
    shield_month: '',
    shield_used_this_month: 0,
    total_shields_used: 0,
    updated_at: new Date().toISOString()
  }
}

// Ebbinghaus intervals in days: stage -> days until next review
const EBBINGHAUS_INTERVALS = [0, 1, 2, 4, 7, 15, 30]

export interface StoreData {
  habits: HabitRow[]
  sessions: SessionRow[]
  decks: DeckRow[]
  cards: CardRow[]
  todos: TodoRow[]
  achievements: AchievementRow[]
  badge_events: BadgeEventRow[]
  user_progress: UserProgress
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
  const empty: StoreData = {
    habits: [],
    sessions: [],
    decks: [],
    cards: [],
    todos: [],
    achievements: [],
    badge_events: [],
    user_progress: defaultUserProgress(),
    sync_meta: { last_sync_at: null, user_id: null }
  }
  if (fs.existsSync(filePath)) {
    try {
      store = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      // Migrate: backfill updated_at for old records
      for (const h of store.habits) {
        if (!h.updated_at) h.updated_at = h.created_at
        // P2a: backfill habit category for legacy data
        if (!h.category || !VALID_HABIT_CATEGORIES.has(h.category)) {
          h.category = 'uncategorized'
        }
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
      if (!store.todos) store.todos = []
      // Migrate: add achievements/badge_events/user_progress if missing
      if (!store.achievements) store.achievements = []
      if (!store.badge_events) store.badge_events = []
      if (!store.user_progress) store.user_progress = defaultUserProgress()
      // P2b: backfill shield fields on legacy user_progress rows.
      const up = store.user_progress as Partial<UserProgress>
      if (typeof up.shields !== 'number') up.shields = 0
      if (typeof up.shield_month !== 'string') up.shield_month = ''
      if (typeof up.shield_used_this_month !== 'number') up.shield_used_this_month = 0
      if (typeof up.total_shields_used !== 'number') up.total_shields_used = 0
      // P2b: default is_shield=0 on legacy sessions only if the caller inspects it.
      // We keep optional to avoid bloating the store; sync layer uses `?? 0`.
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
    category: normalizeCategory(habit.category),
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
  const next: HabitRow = { ...s.habits[idx], ...updates, id, updated_at: new Date().toISOString() }
  // Sanitize category if provided (or backfill if missing)
  if (Object.prototype.hasOwnProperty.call(updates, 'category')) {
    next.category = normalizeCategory(updates.category)
  } else if (!next.category) {
    next.category = 'uncategorized'
  }
  s.habits[idx] = next
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

// Longest historical consecutive-day run for a habit (does not require today).
export function getLongestStreak(habitId: string): number {
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
    .sort() // ascending

  if (qualifiedDates.length === 0) return 0

  let best = 1
  let run = 1
  for (let i = 1; i < qualifiedDates.length; i++) {
    const prev = new Date(qualifiedDates[i - 1])
    const curr = new Date(qualifiedDates[i])
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000
    if (Math.abs(diffDays - 1) < 0.01) {
      run++
      if (run > best) best = run
    } else {
      run = 1
    }
  }
  return best
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

// ============ Todos CRUD ============

export function getAllTodos(): TodoRow[] {
  const s = loadStore()
  return s.todos
    .filter(t => !t.deleted_at)
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
      return a.sort_order - b.sort_order
    })
}

export function createTodo(todo: {
  id: string
  title: string
  notes?: string
  due_date: string
  sort_order?: number
}): TodoRow {
  const s = loadStore()
  const now = new Date().toISOString()
  const row: TodoRow = {
    id: todo.id,
    title: todo.title,
    notes: todo.notes || '',
    due_date: todo.due_date,
    is_done: 0,
    sort_order: todo.sort_order ?? 0,
    created_at: now,
    updated_at: now
  }
  s.todos.push(row)
  saveStore()
  return row
}

export function updateTodo(id: string, updates: Partial<TodoRow>): TodoRow | undefined {
  const s = loadStore()
  const idx = s.todos.findIndex(t => t.id === id)
  if (idx === -1) return undefined
  s.todos[idx] = { ...s.todos[idx], ...updates, id, updated_at: new Date().toISOString() }
  saveStore()
  return s.todos[idx]
}

export function deleteTodo(id: string): void {
  const s = loadStore()
  const idx = s.todos.findIndex(t => t.id === id)
  if (idx !== -1) {
    const now = new Date().toISOString()
    s.todos[idx].deleted_at = now
    s.todos[idx].updated_at = now
    saveStore()
  }
}

// ============ Badge Events ============

export function appendBadgeEvent(event: Omit<BadgeEventRow, 'id' | 'created_at'>): BadgeEventRow {
  const s = loadStore()
  const now = new Date().toISOString()
  const row: BadgeEventRow = {
    id: randomUUID(),
    event_type: event.event_type,
    habit_id: event.habit_id,
    session_id: event.session_id,
    card_id: event.card_id,
    todo_id: event.todo_id,
    started_at: event.started_at,
    ended_at: event.ended_at,
    active_sec: event.active_sec,
    payload: event.payload,
    created_at: now,
    updated_at: now,
    deleted_at: event.deleted_at
  }
  s.badge_events.push(row)
  saveStore()
  return row
}

export function getAllBadgeEvents(): BadgeEventRow[] {
  const s = loadStore()
  return s.badge_events.filter(e => !e.deleted_at)
}

// ============ Achievements ============

export function getAllAchievements(): AchievementRow[] {
  const s = loadStore()
  return s.achievements.filter(a => !a.deleted_at)
}

export function persistAchievement(ach: AchievementRow): AchievementRow {
  const s = loadStore()
  const now = new Date().toISOString()
  // Idempotent by code: if an un-deleted achievement with this code exists, return it unchanged
  const existing = s.achievements.find(a => a.code === ach.code && !a.deleted_at)
  if (existing) return existing
  const row: AchievementRow = {
    ...ach,
    updated_at: ach.updated_at || now
  }
  s.achievements.push(row)
  saveStore()
  return row
}

export function softDeleteAchievement(id: string): void {
  const s = loadStore()
  const idx = s.achievements.findIndex(a => a.id === id)
  if (idx !== -1) {
    const now = new Date().toISOString()
    s.achievements[idx].deleted_at = now
    s.achievements[idx].updated_at = now
    saveStore()
  }
}

// ============ User Progress ============

export function getUserProgress(): UserProgress {
  const s = loadStore()
  return s.user_progress
}

export function setUserProgress(next: UserProgress): void {
  const s = loadStore()
  s.user_progress = { ...next, updated_at: new Date().toISOString() }
  saveStore()
}

// ============ P2b Star Shields ============

/**
 * Current month key in local timezone: 'YYYY-MM'.
 * Used to reset `shield_used_this_month` when the calendar month flips.
 */
export function currentMonthKey(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Check whether the user may redeem a shield right now.
 * Rules: must have at least 1 shield in hand, and must not have already
 * used 2 shields this calendar month (monthly cap = 2).
 */
export function canRedeemShield(
  progress: UserProgress
): { ok: boolean; reason?: string } {
  if ((progress.shields ?? 0) <= 0) {
    return { ok: false, reason: '没有可用的星辰盾' }
  }
  const month = currentMonthKey()
  const usedThisMonth =
    progress.shield_month === month ? (progress.shield_used_this_month ?? 0) : 0
  if (usedThisMonth >= 2) {
    return { ok: false, reason: '本月星辰盾已用完（最多2次/月）' }
  }
  return { ok: true }
}

/**
 * Construct a shield-backfill session for a habit on `missedDate` (YYYY-MM-DD, local).
 * The timestamp is set to 00:30 local time of that date, and `active_sec` is set
 * to the habit's daily goal so the session qualifies as a valid day in getStreak.
 *
 * Returned row is NOT yet pushed to the store; callers should push + save.
 */
export function createShieldSession(habitId: string, missedDate: string): SessionRow {
  const s = loadStore()
  const habit = s.habits.find(h => h.id === habitId)
  const goalSec = Math.max(1, (habit?.daily_goal_m ?? 30) * 60)

  // Build a local-time timestamp of missedDate 00:30, then convert to ISO.
  // missedDate is YYYY-MM-DD (local).
  const [y, m, d] = missedDate.split('-').map(n => parseInt(n, 10))
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 30, 0, 0)
  const end = new Date(start.getTime() + goalSec * 1000)
  const startedAt = start.toISOString()
  const endedAt = end.toISOString()
  const nowIso = new Date().toISOString()

  return {
    id: randomUUID(),
    habit_id: habitId,
    started_at: startedAt,
    ended_at: endedAt,
    active_sec: goalSec,
    idle_sec: 0,
    notes: '',
    updated_at: nowIso,
    is_shield: 1
  }
}

/**
 * Check whether the given habit was "missed yesterday" in local time:
 * yesterday exists as a real past day AND it has no session whose local-day
 * total active_sec meets the habit's daily_goal_m * 60.
 *
 * Returns false if the habit does not exist.
 */
export function wasMissedYesterday(habitId: string): boolean {
  const s = loadStore()
  const habit = s.habits.find(h => h.id === habitId)
  if (!habit) return false

  // Yesterday's local date in YYYY-MM-DD (using local tz).
  const now = new Date()
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yy = y.getFullYear()
  const mm = String(y.getMonth() + 1).padStart(2, '0')
  const dd = String(y.getDate()).padStart(2, '0')
  const yesterdayLocal = `${yy}-${mm}-${dd}`

  const goalSec = habit.daily_goal_m * 60

  let totalSec = 0
  for (const ss of s.sessions) {
    if (ss.habit_id !== habitId || ss.ended_at === null || ss.active_sec <= 0) continue
    // Use local day of started_at to match user-perceived "yesterday".
    const d = new Date(ss.started_at)
    const yy2 = d.getFullYear()
    const mm2 = String(d.getMonth() + 1).padStart(2, '0')
    const dd2 = String(d.getDate()).padStart(2, '0')
    const localDay = `${yy2}-${mm2}-${dd2}`
    if (localDay === yesterdayLocal) totalSec += ss.active_sec
  }

  return totalSec < goalSec
}

export function closeDb(): void {
  // No-op for JSON store
}
