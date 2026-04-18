import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function comingSunday(base: string): string {
  const d = new Date(base + 'T00:00:00')
  const dow = d.getDay() // 0 = Sunday
  const offset = dow === 0 ? 0 : 7 - dow
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

type Bucket = 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'done'

function bucketOf(todo: TodoData, today: string, tomorrow: string, weekEnd: string): Bucket {
  if (todo.is_done === 1) return 'done'
  if (todo.due_date <= today) return 'today'
  if (todo.due_date === tomorrow) return 'tomorrow'
  if (todo.due_date <= weekEnd) return 'thisWeek'
  return 'later'
}

const BUCKET_LABEL: Record<Bucket, string> = {
  today: '今天',
  tomorrow: '明天',
  thisWeek: '本周',
  later: '以后',
  done: '已完成'
}

function formatDueLabel(due: string, today: string, tomorrow: string): string {
  if (due <= today) {
    if (due === today) return '今天'
    // overdue
    const d = new Date(due + 'T00:00:00')
    const t = new Date(today + 'T00:00:00')
    const diff = Math.round((t.getTime() - d.getTime()) / 86400000)
    return `逾期 ${diff} 天`
  }
  if (due === tomorrow) return '明天'
  return due.slice(5) // MM-DD
}

function TodosPage(): JSX.Element {
  const [todos, setTodos] = useState<TodoData[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showDoneSection, setShowDoneSection] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newDue, setNewDue] = useState(todayStr())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadTodos = async () => {
    try {
      const list = await window.api.listTodos()
      setTodos(list)
    } catch (e) {
      // API not wired yet — degrade gracefully
      console.warn('listTodos failed', e)
      setTodos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTodos()
  }, [])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    try {
      await window.api.createTodo({
        title: newTitle.trim(),
        notes: newNotes.trim(),
        due_date: newDue
      })
    } catch (e) {
      console.warn('createTodo failed', e)
    }
    setNewTitle('')
    setNewNotes('')
    setNewDue(todayStr())
    setShowNew(false)
    loadTodos()
  }

  const handleToggle = async (todo: TodoData) => {
    const nextDone = todo.is_done === 1 ? 0 : 1
    const updates: Partial<TodoData> = {
      is_done: nextDone,
      completed_at: nextDone === 1 ? new Date().toISOString() : undefined
    }
    // Optimistic update
    setTodos(prev =>
      prev.map(t =>
        t.id === todo.id
          ? { ...t, is_done: nextDone, completed_at: updates.completed_at }
          : t
      )
    )
    try {
      await window.api.updateTodo(todo.id, updates)
    } catch (e) {
      console.warn('updateTodo failed', e)
      loadTodos()
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.api.deleteTodo(id)
    } catch (e) {
      console.warn('deleteTodo failed', e)
    }
    setDeleteConfirm(null)
    loadTodos()
  }

  const today = todayStr()
  const tomorrow = addDays(today, 1)
  const weekEnd = comingSunday(today)

  const grouped: Record<Bucket, TodoData[]> = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
    done: []
  }
  for (const t of todos) {
    grouped[bucketOf(t, today, tomorrow, weekEnd)].push(t)
  }
  // Sort within each bucket by due_date then sort_order
  for (const key of Object.keys(grouped) as Bucket[]) {
    grouped[key].sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
      return a.sort_order - b.sort_order
    })
  }

  const visibleBuckets: Bucket[] = ['today', 'tomorrow', 'thisWeek', 'later']
  const hasAny = todos.length > 0
  const activeCount = todos.filter(t => t.is_done !== 1).length

  const renderRow = (todo: TodoData, idx: number): JSX.Element => {
    const done = todo.is_done === 1
    const overdue = !done && todo.due_date < today
    return (
      <motion.div
        key={todo.id}
        className="glass-card p-3 flex items-start gap-3"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10 }}
        transition={{ delay: Math.min(idx * 0.03, 0.2) }}
      >
        <button
          onClick={() => handleToggle(todo)}
          className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border transition-all ${
            done
              ? 'bg-success border-success text-white'
              : 'border-bg-border hover:border-accent-cyan/60'
          }`}
          aria-label={done ? '标记为未完成' : '标记为完成'}
        >
          {done && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              done ? 'line-through text-txt-muted' : 'text-txt-primary'
            }`}
          >
            {todo.title}
          </p>
          {todo.notes ? (
            <p className={`text-[11px] mt-0.5 line-clamp-2 ${done ? 'text-txt-muted' : 'text-txt-secondary'}`}>
              {todo.notes}
            </p>
          ) : null}
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                overdue
                  ? 'bg-danger/10 text-danger'
                  : done
                    ? 'bg-bg-elevated text-txt-muted'
                    : 'bg-bg-elevated text-txt-secondary'
              }`}
            >
              {formatDueLabel(todo.due_date, today, tomorrow)}
            </span>
          </div>
        </div>
        <button
          onClick={() => setDeleteConfirm(todo.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-danger hover:bg-danger/10 transition-colors"
          aria-label="删除待办"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-5"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">待办事项</h1>
          {!loading && hasAny && (
            <p className="text-[11px] text-txt-muted mt-0.5">
              {activeCount > 0 ? `${activeCount} 项待完成` : '全部已完成'}
            </p>
          )}
        </div>
        <motion.button
          onClick={() => setShowNew(true)}
          className="btn-glow text-xs py-2 px-3"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          + 新建
        </motion.button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-txt-muted text-sm">
          加载中...
        </div>
      ) : !hasAny ? (
        <motion.div
          className="flex flex-col items-center justify-center py-20 px-8 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-bg-elevated border border-bg-border flex items-center justify-center mb-4 text-txt-muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <p className="text-sm text-txt-secondary mb-1">还没有待办事项</p>
          <p className="text-[11px] text-txt-muted">点击右上角 “+ 新建” 来添加你的第一个待办</p>
        </motion.div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {visibleBuckets.map(bucket => {
              const list = grouped[bucket]
              if (list.length === 0) return null
              return (
                <motion.section
                  key={bucket}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-[11px] uppercase tracking-wider text-txt-secondary font-semibold">
                      {BUCKET_LABEL[bucket]}
                    </h2>
                    <span className="text-[10px] text-txt-muted">{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {list.map((todo, idx) => renderRow(todo, idx))}
                    </AnimatePresence>
                  </div>
                </motion.section>
              )
            })}
          </AnimatePresence>

          {grouped.done.length > 0 && (
            <section className="opacity-80">
              <button
                onClick={() => setShowDoneSection(v => !v)}
                className="flex items-center justify-between w-full mb-2 px-1 text-left"
              >
                <h2 className="text-[11px] uppercase tracking-wider text-txt-secondary font-semibold">
                  {BUCKET_LABEL.done}
                </h2>
                <span className="text-[10px] text-txt-muted flex items-center gap-1">
                  {grouped.done.length}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: showDoneSection ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {showDoneSection && (
                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {grouped.done.map((todo, idx) => renderRow(todo, idx))}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-card p-5 w-full max-w-sm"
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
            >
              <h3 className="text-sm font-semibold mb-4">新建待办</h3>

              <label className="block mb-3">
                <span className="text-xs text-txt-secondary mb-1 block">标题</span>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleCreate()
                    }
                  }}
                  placeholder="要做什么？"
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors"
                />
              </label>

              <label className="block mb-3">
                <span className="text-xs text-txt-secondary mb-1 block">备注（可选）</span>
                <textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="补充一些细节..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors resize-none"
                />
              </label>

              <label className="block mb-4">
                <span className="text-xs text-txt-secondary mb-1 block">截止日期</span>
                <input
                  type="date"
                  value={newDue}
                  onChange={e => setNewDue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm text-txt-primary focus:outline-none focus:border-accent-cyan/40 transition-colors"
                />
              </label>

              <div className="flex gap-2">
                <motion.button
                  onClick={handleCreate}
                  disabled={!newTitle.trim()}
                  className="flex-1 text-xs py-2 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  whileTap={{ scale: 0.95 }}
                >
                  创建
                </motion.button>
                <motion.button
                  onClick={() => {
                    setShowNew(false)
                    setNewTitle('')
                    setNewNotes('')
                    setNewDue(todayStr())
                  }}
                  className="flex-1 text-xs py-2 rounded-lg bg-bg-elevated text-txt-muted border border-bg-border"
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-card p-5 w-full max-w-sm"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
            >
              <h3 className="text-sm font-semibold mb-2">确认删除</h3>
              <p className="text-xs text-txt-muted mb-4">删除后此待办将无法恢复</p>
              <div className="flex gap-2">
                <motion.button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 text-xs py-2 rounded-lg bg-danger/10 text-danger border border-danger/20"
                  whileTap={{ scale: 0.95 }}
                >
                  删除
                </motion.button>
                <motion.button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 text-xs py-2 rounded-lg bg-bg-elevated text-txt-muted border border-bg-border"
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default TodosPage
