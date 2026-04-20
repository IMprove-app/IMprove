import { ElectronAPI } from '@electron-toolkit/preload'

interface HabitWithStats {
  id: string
  name: string
  icon: string
  target_url: string
  target_app: string
  daily_goal_m: number
  sort_order: number
  is_archived: number
  created_at: string
  todaySeconds: number
  streak: number
}

interface SessionData {
  id: string
  habit_id: string
  started_at: string
  ended_at: string | null
  active_sec: number
  idle_sec: number
  notes: string
}

interface AuthResult {
  ok: boolean
  error?: string
}

interface AuthStatus {
  loggedIn: boolean
  email?: string
  userId?: string
}

interface DeckData {
  id: string
  name: string
  created_at: string
  updated_at?: string
}

interface CardData {
  id: string
  deck_id: string
  front: string
  back: string
  review_stage: number
  next_review_at: string
  created_at: string
  updated_at?: string
}

interface TodoData {
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

interface AchievementData {
  id: string
  code: string
  unlocked_at: string
  progress_snapshot?: string
  is_silent: number
  created_at: string
  updated_at?: string
  deleted_at?: string
}

interface BadgeEventData {
  id: string
  event_type: 'session_end' | 'card_review' | 'todo_complete'
  habit_id?: string
  session_id?: string
  card_id?: string
  todo_id?: string
  started_at?: string
  ended_at?: string
  active_sec?: number
  payload?: string
  created_at: string
  updated_at?: string
  deleted_at?: string
}

interface UserProgressData {
  level: number
  xp: number
  total_xp: number
  total_stars: number
  xp_multiplier: number
  rebirth_count: number
  updated_at: string
}

interface SyncStatusPayload {
  state: 'idle' | 'syncing' | 'error' | 'offline'
  lastSync: string | null
  error?: string
}

interface API {
  listHabits(): Promise<HabitWithStats[]>
  createHabit(data: Record<string, unknown>): Promise<HabitWithStats>
  updateHabit(id: string, updates: Record<string, unknown>): Promise<HabitWithStats>
  deleteHabit(id: string): Promise<{ ok: boolean }>
  startSession(habitId: string): Promise<SessionData>
  stopSession(sessionId: string, activeSec: number): Promise<{ ok: boolean }>
  tickSession(sessionId: string, activeSec: number, idleSec: number): Promise<void>
  getActiveSession(): Promise<SessionData | null>
  getStats(range: string): Promise<unknown>

  // Decks
  listDecks(): Promise<DeckData[]>
  createDeck(data: { id: string; name: string }): Promise<DeckData>
  updateDeck(id: string, updates: { name?: string }): Promise<DeckData>
  deleteDeck(id: string): Promise<{ ok: boolean }>

  // Cards
  listCards(deckId: string): Promise<CardData[]>
  createCardsBatch(cards: { id: string; deck_id: string; front: string; back: string }[]): Promise<CardData[]>
  updateCard(id: string, updates: { front?: string; back?: string }): Promise<CardData>
  deleteCard(id: string): Promise<{ ok: boolean }>

  // Review
  getDueCards(): Promise<CardData[]>
  getDueCardCount(): Promise<number>
  reviewRemembered(cardId: string): Promise<{ ok: boolean }>
  reviewForgot(cardId: string): Promise<{ ok: boolean }>

  // Todos
  listTodos(): Promise<TodoData[]>
  createTodo(data: { title: string; notes?: string; due_date: string; sort_order?: number }): Promise<TodoData>
  updateTodo(id: string, updates: Record<string, unknown>): Promise<TodoData>
  deleteTodo(id: string): Promise<{ ok: boolean }>

  // Progress & Achievements
  getProgress(): Promise<UserProgressData>
  listAchievements(): Promise<AchievementData[]>
  recomputeAchievements(): Promise<{ ok: boolean; progress: UserProgressData; unlocked: AchievementData[] }>
  onProgressUpdated(callback: (payload: UserProgressData) => void): () => void
  onAchievementUnlocked(callback: (payload: AchievementData) => void): () => void

  // Auth
  login(email: string, password: string): Promise<AuthResult>
  register(email: string, password: string): Promise<AuthResult>
  logout(): Promise<{ ok: boolean }>
  getAuthStatus(): Promise<AuthStatus>

  // Sync
  triggerSync(): Promise<{ ok: boolean }>
  getSyncStatus(): Promise<SyncStatusPayload>
  onSyncStatus(callback: (status: SyncStatusPayload) => void): () => void

  minimizeWindow(): Promise<void>
  closeWindow(): Promise<void>

  // Auto-updater
  checkForUpdate(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateAvailable(callback: (version: string) => void): () => void
  onUpdateProgress(callback: (percent: number) => void): () => void
  onUpdateDownloaded(callback: () => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
