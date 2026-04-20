import { v4 as uuidv4 } from 'uuid'
import type {
  BadgeEventRow,
  AchievementRow,
  UserProgress,
  StoreData,
  SessionRow
} from '../db'

// ============================================================
// Pure achievement engine (no I/O, deterministic)
// Exports:
//   - evaluateSessionEnd(store, event)
//   - recomputeAll(store)
// ============================================================

// ---------- Date helpers (local timezone) ----------

/** Local YYYY-MM-DD for an ISO string. */
function localDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Number of whole local-days between two YYYY-MM-DD keys (b - a). */
function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const aT = new Date(ay, am - 1, ad).getTime()
  const bT = new Date(by, bm - 1, bd).getTime()
  return Math.round((bT - aT) / 86400000)
}

/** Longest consecutive-day streak across a set of local date keys. */
function longestConsecutiveRun(dateKeys: string[]): number {
  if (dateKeys.length === 0) return 0
  const uniq = Array.from(new Set(dateKeys)).sort()
  let best = 1
  let cur = 1
  for (let i = 1; i < uniq.length; i++) {
    if (daysBetweenKeys(uniq[i - 1], uniq[i]) === 1) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 1
    }
  }
  return best
}

// ---------- XP / stars ----------

function computeStarsForSession(activeSec: number, streakDays: number): number {
  if (activeSec < 60) return 0
  const base = 10
  const streakMultiplier = Math.min(1 + streakDays * 0.02, 2)
  return Math.round(base * streakMultiplier)
}

function xpForLevelUp(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5))
}

const LEVEL_CAP = 20

function applyXp(current: UserProgress, xpGained: number, nowIso: string): UserProgress {
  let level = current.level
  let xp = current.xp + xpGained
  const totalXp = current.total_xp + xpGained
  const totalStars = current.total_stars + xpGained
  while (level < LEVEL_CAP && xp >= xpForLevelUp(level)) {
    xp -= xpForLevelUp(level)
    level += 1
  }
  return {
    level,
    xp,
    total_xp: totalXp,
    total_stars: totalStars,
    xp_multiplier: current.xp_multiplier,
    rebirth_count: current.rebirth_count,
    updated_at: nowIso
  }
}

// ---------- Streak (for session-scoped XP bonus) ----------

/**
 * Compute the current consecutive-day streak (including the event's day)
 * for a given habit, using committed sessions as the source of truth.
 * Days are counted once a session exists for that habit on that local day.
 */
function computeStreakForHabit(
  sessions: SessionRow[],
  habitId: string | undefined,
  eventStartedAt: string | undefined
): number {
  if (!habitId || !eventStartedAt) return 0
  const days = new Set<string>()
  for (const s of sessions) {
    if (s.habit_id !== habitId) continue
    if (!s.ended_at) continue
    days.add(localDateKey(s.started_at))
  }
  // Ensure the current event's day is counted (session may not be persisted yet).
  days.add(localDateKey(eventStartedAt))

  const endKey = localDateKey(eventStartedAt)
  if (!days.has(endKey)) return 0

  let streak = 1
  // Walk backwards day by day.
  const [y, m, d] = endKey.split('-').map(Number)
  const cursor = new Date(y, m - 1, d)
  while (true) {
    cursor.setDate(cursor.getDate() - 1)
    const key =
      `${cursor.getFullYear()}-` +
      `${String(cursor.getMonth() + 1).padStart(2, '0')}-` +
      `${String(cursor.getDate()).padStart(2, '0')}`
    if (days.has(key)) streak += 1
    else break
  }
  return streak
}

// ---------- Badge definitions ----------

interface BadgeDef {
  code: string
  name: string
  check: (store: StoreData) => boolean
  progressSnapshot?: (store: StoreData) => string
}

function sessionEndEvents(store: StoreData): BadgeEventRow[] {
  return store.badge_events.filter(e => e.event_type === 'session_end' && !e.deleted_at)
}

function getHourLocal(iso: string | undefined): number {
  if (!iso) return -1
  return new Date(iso).getHours()
}

const BADGES: BadgeDef[] = [
  {
    code: 'first_light',
    name: '初光',
    check: (store) => sessionEndEvents(store).length >= 1,
    progressSnapshot: (store) => JSON.stringify({ sessions: sessionEndEvents(store).length })
  },
  {
    code: 'dawn_messenger',
    name: '拂晓使者',
    check: (store) => {
      const count = sessionEndEvents(store).filter(e => {
        const h = getHourLocal(e.started_at)
        return h >= 0 && h < 6
      }).length
      return count >= 5
    },
    progressSnapshot: (store) => {
      const count = sessionEndEvents(store).filter(e => {
        const h = getHourLocal(e.started_at)
        return h >= 0 && h < 6
      }).length
      return JSON.stringify({ count })
    }
  },
  {
    code: 'night_watcher',
    name: '守夜人',
    check: (store) => {
      const count = sessionEndEvents(store).filter(e => {
        const h = getHourLocal(e.started_at)
        return h >= 23
      }).length
      return count >= 5
    },
    progressSnapshot: (store) => {
      const count = sessionEndEvents(store).filter(e => {
        const h = getHourLocal(e.started_at)
        return h >= 23
      }).length
      return JSON.stringify({ count })
    }
  },
  {
    code: 'returning_voyager',
    name: '归航者',
    check: (store) => {
      const events = sessionEndEvents(store)
        .filter(e => !!e.started_at)
        .slice()
        .sort((a, b) => (a.started_at! < b.started_at! ? -1 : 1))
      let voyages = 0
      for (let i = 1; i < events.length; i++) {
        const prev = localDateKey(events[i - 1].started_at!)
        const cur = localDateKey(events[i].started_at!)
        if (daysBetweenKeys(prev, cur) >= 7) voyages += 1
      }
      return voyages >= 3
    },
    progressSnapshot: (store) => {
      const events = sessionEndEvents(store)
        .filter(e => !!e.started_at)
        .slice()
        .sort((a, b) => (a.started_at! < b.started_at! ? -1 : 1))
      let voyages = 0
      for (let i = 1; i < events.length; i++) {
        const prev = localDateKey(events[i - 1].started_at!)
        const cur = localDateKey(events[i].started_at!)
        if (daysBetweenKeys(prev, cur) >= 7) voyages += 1
      }
      return JSON.stringify({ voyages })
    }
  },
  {
    code: 'self_rotator',
    name: '自转者',
    check: (store) => {
      const byHabit: Record<string, string[]> = {}
      for (const e of sessionEndEvents(store)) {
        if (!e.habit_id || !e.started_at) continue
        const key = localDateKey(e.started_at)
        if (!byHabit[e.habit_id]) byHabit[e.habit_id] = []
        byHabit[e.habit_id].push(key)
      }
      for (const habitId of Object.keys(byHabit)) {
        if (longestConsecutiveRun(byHabit[habitId]) >= 21) return true
      }
      return false
    },
    progressSnapshot: (store) => {
      const byHabit: Record<string, string[]> = {}
      for (const e of sessionEndEvents(store)) {
        if (!e.habit_id || !e.started_at) continue
        const key = localDateKey(e.started_at)
        if (!byHabit[e.habit_id]) byHabit[e.habit_id] = []
        byHabit[e.habit_id].push(key)
      }
      let bestHabit = ''
      let bestRun = 0
      for (const habitId of Object.keys(byHabit)) {
        const run = longestConsecutiveRun(byHabit[habitId])
        if (run > bestRun) {
          bestRun = run
          bestHabit = habitId
        }
      }
      return JSON.stringify({ habit_id: bestHabit, run: bestRun })
    }
  },
  {
    code: 'faint_snow',
    name: '微光积雪',
    check: (store) => sessionEndEvents(store).length >= 50,
    progressSnapshot: (store) => JSON.stringify({ sessions: sessionEndEvents(store).length })
  }
]

function hasAchievement(store: StoreData, code: string): boolean {
  return store.achievements.some(a => a.code === code && !a.deleted_at)
}

function makeAchievementRow(
  def: BadgeDef,
  store: StoreData,
  isSilent: number,
  nowIso: string
): AchievementRow {
  return {
    id: uuidv4(),
    code: def.code,
    unlocked_at: nowIso,
    progress_snapshot: def.progressSnapshot ? def.progressSnapshot(store) : undefined,
    is_silent: isSilent,
    created_at: nowIso,
    updated_at: nowIso
  }
}

// ============================================================
// Public API
// ============================================================

export function evaluateSessionEnd(
  store: StoreData,
  event: BadgeEventRow
): {
  xpGained: number
  newProgress: UserProgress
  newAchievements: AchievementRow[]
} {
  const nowIso = new Date().toISOString()

  // --- XP ---
  let xpGained = 0
  if (event.event_type === 'session_end') {
    const activeSec = event.active_sec ?? 0
    const streakDays = computeStreakForHabit(store.sessions, event.habit_id, event.started_at)
    xpGained = computeStarsForSession(activeSec, streakDays)
  }
  const newProgress = applyXp(store.user_progress, xpGained, nowIso)

  // --- Achievements ---
  const newAchievements: AchievementRow[] = []
  if (event.event_type === 'session_end') {
    for (const def of BADGES) {
      if (hasAchievement(store, def.code)) continue
      if (def.check(store)) {
        newAchievements.push(makeAchievementRow(def, store, 0, nowIso))
      }
    }
  }

  return { xpGained, newProgress, newAchievements }
}

export function recomputeAll(store: StoreData): {
  newProgress: UserProgress
  newAchievements: AchievementRow[]
} {
  const nowIso = new Date().toISOString()

  // --- Rebuild user_progress from scratch by replaying session_end events in order. ---
  let progress: UserProgress = {
    level: 1,
    xp: 0,
    total_xp: 0,
    total_stars: 0,
    xp_multiplier: store.user_progress.xp_multiplier || 1,
    rebirth_count: store.user_progress.rebirth_count || 0,
    updated_at: nowIso
  }

  const orderedEvents = sessionEndEvents(store)
    .filter(e => !!e.started_at)
    .slice()
    .sort((a, b) => (a.started_at! < b.started_at! ? -1 : 1))

  // Track day sets per habit so we can compute the streak *as of* each event.
  const habitDays: Record<string, Set<string>> = {}
  for (const e of orderedEvents) {
    const habitId = e.habit_id
    const startedAt = e.started_at
    if (habitId && startedAt) {
      const key = localDateKey(startedAt)
      if (!habitDays[habitId]) habitDays[habitId] = new Set<string>()
      habitDays[habitId].add(key)
      // Compute streak ending on this event's day.
      let streak = 1
      const [y, m, d] = key.split('-').map(Number)
      const cursor = new Date(y, m - 1, d)
      while (true) {
        cursor.setDate(cursor.getDate() - 1)
        const ck =
          `${cursor.getFullYear()}-` +
          `${String(cursor.getMonth() + 1).padStart(2, '0')}-` +
          `${String(cursor.getDate()).padStart(2, '0')}`
        if (habitDays[habitId].has(ck)) streak += 1
        else break
      }
      const xp = computeStarsForSession(e.active_sec ?? 0, streak)
      progress = applyXp(progress, xp, nowIso)
    } else {
      const xp = computeStarsForSession(e.active_sec ?? 0, 0)
      progress = applyXp(progress, xp, nowIso)
    }
  }

  // --- Retroactive silent unlocks for badges the user already qualifies for. ---
  const newAchievements: AchievementRow[] = []
  for (const def of BADGES) {
    if (hasAchievement(store, def.code)) continue
    if (def.check(store)) {
      newAchievements.push(makeAchievementRow(def, store, 1, nowIso))
    }
  }

  return { newProgress: progress, newAchievements }
}
