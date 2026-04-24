import { useState, useEffect, useRef } from 'react'
import { Reorder, useDragControls } from 'framer-motion'

interface TodoRow {
  id: string
  title: string
  notes?: string
  due_date?: string
  is_done?: number
  sort_order?: number
  created_at?: string
}

interface ActiveState {
  todoId: string | null
  startedAt: number | null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

interface RowProps {
  todo: TodoRow
  isActive: boolean
  elapsed: number
  onRowClick: (todo: TodoRow) => void
  onToggleDone: (todo: TodoRow, e: React.MouseEvent) => void
}

function TaskRow({ todo, isActive, elapsed, onRowClick, onToggleDone }: RowProps): JSX.Element {
  const controls = useDragControls()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const s = Math.max(0, Math.floor(elapsed))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const elapsedStr = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`

  return (
    <Reorder.Item
      value={todo}
      dragListener={false}
      dragControls={controls}
      onClick={() => onRowClick(todo)}
      className={`group flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer transition-colors border ${
        isActive
          ? 'bg-accent-cyan/10 border-accent-cyan/30'
          : 'bg-bg-elevated/60 border-transparent hover:bg-bg-elevated'
      }`}
      style={{ ['WebkitAppRegion' as never]: 'no-drag' }}
    >
      {/* Drag handle — only this starts the drag, so row clicks still fire. */}
      <div
        onPointerDown={e => { e.stopPropagation(); controls.start(e) }}
        onClick={e => e.stopPropagation()}
        title="拖动排序"
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-txt-muted hover:text-txt-secondary cursor-grab active:cursor-grabbing"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2" cy="2" r="1" />
          <circle cx="8" cy="2" r="1" />
          <circle cx="2" cy="7" r="1" />
          <circle cx="8" cy="7" r="1" />
          <circle cx="2" cy="12" r="1" />
          <circle cx="8" cy="12" r="1" />
        </svg>
      </div>

      {/* Done toggle (click marks complete; also stops the timer if running) */}
      <button
        onClick={e => onToggleDone(todo, e)}
        title="标记为完成"
        className={`w-4 h-4 rounded-full flex-shrink-0 border transition-colors ${
          isActive
            ? 'border-accent-cyan hover:bg-accent-cyan/20'
            : 'border-bg-border hover:border-accent-cyan/60'
        }`}
        style={
          isActive
            ? { boxShadow: '0 0 0 3px rgba(0, 122, 255, 0.18)' }
            : undefined
        }
      />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] truncate ${
            isActive ? 'text-accent-cyan font-semibold' : 'text-txt-primary'
          }`}
        >
          {todo.title}
        </p>
      </div>

      {/* Elapsed readout */}
      <span
        className={`text-[11px] font-mono tabular-nums ${
          isActive ? 'text-accent-cyan' : 'text-txt-secondary'
        }`}
      >
        {elapsedStr}
      </span>

      {/* Play/pause (visual; click handled on row too) */}
      <button
        onClick={e => {
          e.stopPropagation()
          onRowClick(todo)
        }}
        title={isActive ? '暂停' : '开始'}
        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
          isActive
            ? 'bg-accent-cyan text-white'
            : 'text-txt-secondary hover:bg-bg-border'
        }`}
      >
        {isActive ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </Reorder.Item>
  )
}

function Tasks(): JSX.Element {
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [elapsedMap, setElapsedMap] = useState<Record<string, number>>({})
  const [active, setActive] = useState<ActiveState>({ todoId: null, startedAt: null })
  const [pinned, setPinned] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // Tick driver: re-render every second so the running row recomputes its live readout.
  const [, setNow] = useState(Date.now())
  const pinnedRef = useRef(false)
  const listContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  // Transparent body so the glass container's rounded corners are visible.
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => {
      document.body.style.background = prev
    }
  }, [])

  const refreshTodos = (): void => {
    window.api.tasksListTodos()
      .then(list => setTodos((list as TodoRow[]) ?? []))
      .catch(() => {})
  }

  const refreshElapsed = (): void => {
    window.api.tasksGetElapsedMap()
      .then(m => setElapsedMap(m ?? {}))
      .catch(() => {})
  }

  const refreshActive = (): void => {
    window.api.tasksGetActive()
      .then(a => setActive(a ? { todoId: a.todoId, startedAt: a.startedAt } : { todoId: null, startedAt: null }))
      .catch(() => {})
  }

  // Initial parallel fetch + subscriptions.
  useEffect(() => {
    Promise.all([
      window.api.tasksListTodos().catch(() => [] as TodoRow[]),
      window.api.tasksGetActive().catch(() => null),
      window.api.tasksGetElapsedMap().catch(() => ({} as Record<string, number>)),
      window.api.tasksGetPinned().catch(() => false)
    ]).then(([list, act, map, pin]) => {
      setTodos((list as TodoRow[]) ?? [])
      setActive(act ? { todoId: act.todoId, startedAt: act.startedAt } : { todoId: null, startedAt: null })
      setElapsedMap((map as Record<string, number>) ?? {})
      setPinned(!!pin)
    })

    const offPinned = window.api.onTasksPinnedChanged(setPinned)
    const offList = window.api.onTasksTodosChanged(() => refreshTodos())
    const offActive = window.api.onTasksActiveChanged(payload => {
      setActive({ todoId: payload.todoId, startedAt: payload.startedAt })
      // Pausing creates a new session row → baseline map bumped by main.
      refreshElapsed()
    })
    return () => {
      offPinned()
      offList()
      offActive()
    }
  }, [])

  // Tick: only run while a task is active.
  useEffect(() => {
    if (!active.todoId || !active.startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active.todoId, active.startedAt])

  // Esc → hide, but only when NOT pinned (matches scratch behavior).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (pinnedRef.current) return
      e.preventDefault()
      window.api.tasksHide().catch(() => {})
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleTogglePin = async (): Promise<void> => {
    const next = !pinned
    setPinned(next)
    try {
      await window.api.tasksSetPinned(next)
    } catch {
      // revert on error; state will also be corrected by onTasksPinnedChanged
      setPinned(!next)
    }
  }

  const handleClose = (): void => {
    window.api.tasksHide().catch(() => {})
  }

  const handleRowClick = (todo: TodoRow): void => {
    if (active.todoId === todo.id) {
      window.api.tasksPause().catch(() => {})
    } else {
      window.api.tasksStart(todo.id).catch(() => {})
    }
  }

  const handleQuickCreate = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title) return
    try {
      await window.api.createTodo({ title, notes: '', due_date: todayStr() })
    } catch {
      // Error surfaces via empty list; ignore — main broadcasts tasks:todos-changed on success.
    }
    setNewTitle('')
    // Refresh immediately in case the broadcast is slower than the resolve.
    refreshTodos()
  }

  const handleToggleDone = async (todo: TodoRow, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    // Pause first so the running timer doesn't keep ticking against a completed todo.
    if (active.todoId === todo.id) {
      try { await window.api.tasksPause() } catch { /* ignore */ }
    }
    try {
      await window.api.updateTodo(todo.id, {
        is_done: 1,
        completed_at: new Date().toISOString()
      })
    } catch {
      // Row will stay; user can retry.
    }
  }

  const computeRowElapsed = (todoId: string): number => {
    const baseline = elapsedMap[todoId] ?? 0
    if (active.todoId === todoId && active.startedAt) {
      return baseline + Math.floor((Date.now() - active.startedAt) / 1000)
    }
    return baseline
  }

  const handleReorder = (newList: TodoRow[]): void => {
    setTodos(newList) // optimistic, keeps drag animation smooth
    window.api.tasksReorder(newList.map(t => t.id)).catch(() => {
      // Main broadcasts tasks:todos-changed on success; on failure, refetch.
      refreshTodos()
    })
  }

  // When a task starts running, promote-to-top on main side fires a
  // todos-changed event that refreshes the list. Then scroll container to top
  // so the running row is in view. Delay lets the refetch settle.
  useEffect(() => {
    if (!active.todoId) return
    const id = setTimeout(() => {
      listContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(id)
  }, [active.todoId])

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden rounded-2xl relative"
      style={{
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.22)',
        border: '1px solid rgba(0, 0, 0, 0.06)'
      }}
    >
      {/* Title bar (drag region) */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-bg-border"
        style={{ flexShrink: 0, ['WebkitAppRegion' as never]: 'drag' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-txt-secondary select-none truncate">
            任务进行栏
          </span>
        </div>
        <div
          className="flex items-center gap-1 flex-shrink-0"
          style={{ ['WebkitAppRegion' as never]: 'no-drag' }}
        >
          <button
            onClick={handleTogglePin}
            title={pinned ? '取消置顶' : '置顶到最前'}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              pinned ? 'bg-accent-cyan/15 text-accent-cyan' : 'text-txt-secondary hover:bg-bg-elevated'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79L15 12V7h1a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1v5l-2.89 1.45A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
          <button
            onClick={handleClose}
            title="收起 (Esc)"
            className="w-7 h-7 rounded-md flex items-center justify-center text-txt-secondary hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick-add input */}
      <div
        className="px-2 py-1.5 border-b border-bg-border"
        style={{ flexShrink: 0, ['WebkitAppRegion' as never]: 'no-drag' }}
      >
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleQuickCreate()
            }
          }}
          placeholder="+ 新任务 (回车添加)"
          className="w-full px-2.5 py-1.5 rounded-md bg-bg-elevated/60 border border-transparent text-[12px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 focus:bg-bg-elevated transition-colors"
        />
      </div>

      {/* Body */}
      <div ref={listContainerRef} className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {todos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="text-[11px] text-txt-muted leading-relaxed">
              暂无任务，输入上方添加一条
            </div>
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={todos}
            onReorder={handleReorder}
            className="space-y-1.5 list-none p-0 m-0"
          >
            {todos.map(todo => (
              <TaskRow
                key={todo.id}
                todo={todo}
                isActive={active.todoId === todo.id}
                elapsed={computeRowElapsed(todo.id)}
                onRowClick={handleRowClick}
                onToggleDone={handleToggleDone}
              />
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  )
}

export default Tasks
