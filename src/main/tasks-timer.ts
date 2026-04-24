import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { appendTaskSession, listTaskSessions, promoteTodoInBar, TaskSessionRow } from './db'
import { getTasksWindow } from './tasks'

function broadcastTodosChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('tasks:todos-changed')
  }
}

interface ActiveTimer {
  todoId: string | null
  startedAt: number | null
}

const state: ActiveTimer = {
  todoId: null,
  startedAt: null
}

function emitActiveChanged(): void {
  const win = getTasksWindow()
  if (!win) return
  win.webContents.send('tasks:active-changed', {
    todoId: state.todoId,
    startedAt: state.startedAt
  })
}

function finalizeActive(): void {
  if (!state.todoId || state.startedAt == null) return
  const endedMs = Date.now()
  const elapsedSec = Math.max(0, Math.round((endedMs - state.startedAt) / 1000))
  const startedIso = new Date(state.startedAt).toISOString()
  const endedIso = new Date(endedMs).toISOString()
  const row: TaskSessionRow = {
    id: randomUUID(),
    todo_id: state.todoId,
    started_at: startedIso,
    ended_at: endedIso,
    active_sec: elapsedSec,
    created_at: startedIso,
    updated_at: endedIso
  }
  appendTaskSession(row)
}

export function startTimer(todoId: string): void {
  if (!todoId) return
  // If already running for this todo, no-op.
  if (state.todoId === todoId && state.startedAt != null) return
  // Finalize any previous active timer before starting the new one.
  if (state.todoId && state.startedAt != null) {
    finalizeActive()
  }
  // Lift the target to the top of the bar so the running task is always row 0.
  promoteTodoInBar(todoId)
  state.todoId = todoId
  state.startedAt = Date.now()
  emitActiveChanged()
  // Order changed → renderer must refetch list; the active-changed event
  // alone doesn't carry order info.
  broadcastTodosChanged()
}

export function pauseTimer(): void {
  if (!state.todoId || state.startedAt == null) return
  finalizeActive()
  state.todoId = null
  state.startedAt = null
  emitActiveChanged()
}

// Called on app before-quit. Persist any in-flight timer so active_sec isn't lost.
export function flushActive(): void {
  if (!state.todoId || state.startedAt == null) return
  finalizeActive()
  state.todoId = null
  state.startedAt = null
}

export function getActive(): { todoId: string; startedAt: number } | null {
  if (state.todoId && state.startedAt != null) {
    return { todoId: state.todoId, startedAt: state.startedAt }
  }
  return null
}

// Aggregate total active_sec per todo across all non-deleted task_sessions,
// plus the in-flight elapsed seconds for the currently active todo (if any).
export function getElapsedMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of listTaskSessions()) {
    map[r.todo_id] = (map[r.todo_id] || 0) + (r.active_sec || 0)
  }
  if (state.todoId && state.startedAt != null) {
    const liveSec = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000))
    map[state.todoId] = (map[state.todoId] || 0) + liveSec
  }
  return map
}
