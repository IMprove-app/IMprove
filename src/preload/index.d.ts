import { ElectronAPI } from '@electron-toolkit/preload'

// Habit category (P2a). One of the known values; old data falls back to 'uncategorized'.
type HabitCategory =
  | 'uncategorized'
  | 'health'
  | 'learning'
  | 'emotion'
  | 'creation'
  | 'relation'

interface HabitWithStats {
  id: string
  name: string
  icon: string
  target_url: string
  target_app: string
  daily_goal_m: number
  sort_order: number
  is_archived: number
  /** P2a: habit category. Defaults to 'uncategorized' for legacy rows. */
  category: HabitCategory | string
  created_at: string
  todaySeconds: number
  streak: number
  /** P2a: longest historical consecutive-day streak (does not require today). */
  longestStreak: number
  /** P2b: true if yesterday's active_sec for this habit was below daily goal. */
  missedYesterday: boolean
}

interface SessionData {
  id: string
  habit_id: string
  started_at: string
  ended_at: string | null
  active_sec: number
  idle_sec: number
  notes: string
  /** P2b: 1 if the session was created via shield:redeem. */
  is_shield?: number
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

interface SnippetFolderData {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at?: string
  deleted_at?: string
}

interface SnippetData {
  id: string
  folder_id?: string
  title: string
  content: string
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
  /** P2b: current shields in hand (0-3). */
  shields: number
  /** P2b: 'YYYY-MM' local key for monthly cap tracking. */
  shield_month: string
  /** P2b: shields redeemed this calendar month (0-2). */
  shield_used_this_month: number
  /** P2b: lifetime shield redemptions (drives shield-related achievements). */
  total_shields_used: number
  updated_at: string
}

interface SyncStatusPayload {
  state: 'idle' | 'syncing' | 'error' | 'offline'
  lastSync: string | null
  error?: string
}

interface API {
  listHabits(): Promise<HabitWithStats[]>
  /**
   * Create a habit. Optional `category` field (HabitCategory) is forwarded;
   * unknown values are coerced to 'uncategorized' on the main side.
   */
  createHabit(data: Record<string, unknown>): Promise<HabitWithStats>
  /**
   * Update a habit. May include optional `category` field (HabitCategory).
   */
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

  // Star Shields (P2b)
  redeemShield(habitId: string): Promise<{ ok: boolean; reason?: string; progress?: UserProgressData }>

  // Snippet folders
  listSnippetFolders(): Promise<SnippetFolderData[]>
  createSnippetFolder(data: { name: string; sort_order?: number }): Promise<SnippetFolderData>
  updateSnippetFolder(id: string, updates: Record<string, unknown>): Promise<SnippetFolderData>
  deleteSnippetFolder(id: string): Promise<{ ok: boolean }>
  onSnippetFoldersChanged(callback: () => void): () => void

  // Snippet HUD
  listSnippets(folderId?: string): Promise<SnippetData[]>
  createSnippet(data: { title?: string; content: string; folder_id?: string; sort_order?: number }): Promise<SnippetData>
  updateSnippet(id: string, updates: Record<string, unknown>): Promise<SnippetData>
  deleteSnippet(id: string): Promise<{ ok: boolean }>
  copySnippet(id: string): Promise<{ ok: boolean; reason?: string }>
  onSnippetsChanged(callback: () => void): () => void

  // HUD window
  toggleHud(): Promise<void>
  hideHud(): Promise<void>
  getHudPinned(): Promise<boolean>
  setHudPinned(pinned: boolean): Promise<{ ok: boolean }>
  onHudPinnedChanged(callback: (pinned: boolean) => void): () => void

  // Hotkey
  getHudHotkey(): Promise<string>
  setHudHotkey(accel: string): Promise<{ ok: boolean; error?: string; active?: string }>
  onHotkeyConflict(callback: (payload: { accel: string; error?: string }) => void): () => void

  // Scratch Pad window
  toggleScratch(): Promise<void>
  hideScratch(): Promise<void>
  getScratchPinned(): Promise<boolean>
  setScratchPinned(pinned: boolean): Promise<{ ok: boolean }>
  onScratchPinnedChanged(callback: (pinned: boolean) => void): () => void
  getScratchDraft(): Promise<string>
  setScratchDraft(draft: string): Promise<{ ok: boolean }>
  getScratchHotkey(): Promise<string>
  setScratchHotkey(accel: string): Promise<{ ok: boolean; error?: string; active?: string }>

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
