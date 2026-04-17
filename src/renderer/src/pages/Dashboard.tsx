import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import HabitCard from '../components/HabitCard'
import AddHabitModal from '../components/AddHabitModal'
import { ActiveSession } from '../App'

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

interface Props {
  onSessionStart: (session: ActiveSession) => void
  onOpenSettings: () => void
  dueCount?: number
  onStartReview?: () => void
}

function Dashboard({ onSessionStart, onOpenSettings, dueCount, onStartReview }: Props): JSX.Element {
  const [habits, setHabits] = useState<HabitWithStats[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingHabit, setEditingHabit] = useState<HabitWithStats | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadHabits = useCallback(async () => {
    const list = await window.api.listHabits()
    setHabits(list)
  }, [])

  useEffect(() => {
    loadHabits()
  }, [loadHabits])

  const handleAdd = async (data: {
    name: string; icon: string; target_url: string; target_app: string; daily_goal_m: number
  }) => {
    await window.api.createHabit({ ...data, sort_order: habits.length })
    setShowAdd(false)
    loadHabits()
  }

  const handleEdit = async (data: {
    name: string; icon: string; target_url: string; target_app: string; daily_goal_m: number
  }) => {
    if (!editingHabit) return
    await window.api.updateHabit(editingHabit.id, data)
    setEditingHabit(null)
    loadHabits()
  }

  const handleDelete = async (id: string) => {
    await window.api.deleteHabit(id)
    setDeleteConfirm(null)
    loadHabits()
  }

  const totalMin = habits.reduce((s, h) => s + Math.floor(h.todaySeconds / 60), 0)
  const completedCount = habits.filter(h => Math.floor(h.todaySeconds / 60) >= h.daily_goal_m).length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <motion.div
        className="px-5 pt-4 pb-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-txt-primary">{getGreeting()}</h1>
          <motion.button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center text-txt-muted hover:text-txt-secondary transition-colors"
            whileHover={{ scale: 1.1, rotate: 45 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </motion.button>
        </div>
        <p className="text-xs text-txt-secondary mt-1">
          已完成 <span className="text-accent-cyan font-semibold">{completedCount}</span> / {habits.length} 个习惯
          {totalMin > 0 && (
            <span className="ml-2">
              总计 <span className="font-mono text-txt-primary">{formatTotalTime(totalMin)}</span>
            </span>
          )}
        </p>

        {habits.length > 0 && (
          <div className="progress-track mt-3">
            <motion.div
              className={`progress-fill ${completedCount === habits.length && habits.length > 0 ? 'complete' : ''}`}
              initial={{ width: 0 }}
              animate={{ width: `${habits.length > 0 ? (completedCount / habits.length) * 100 : 0}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}
      </motion.div>

      {/* Habit list */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        {/* Review reminder */}
        {(dueCount ?? 0) > 0 && (
          <motion.div
            className="p-3 rounded-xl bg-streak/10 border border-streak/20 flex items-center justify-between"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📝</span>
              <span className="text-xs text-streak font-medium">
                {dueCount} 张卡片待复习
              </span>
            </div>
            <motion.button
              onClick={onStartReview}
              className="text-[10px] px-3 py-1 rounded-lg bg-streak/20 text-streak border border-streak/30 font-medium"
              whileTap={{ scale: 0.95 }}
            >
              去复习
            </motion.button>
          </motion.div>
        )}
        {habits.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-full text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <motion.span
              className="text-5xl mb-4"
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            >
              🎯
            </motion.span>
            <p className="text-sm text-txt-secondary mb-1">还没有添加习惯</p>
            <p className="text-xs text-txt-muted mb-4">点击下方按钮开始你的第一个习惯</p>
          </motion.div>
        ) : (
          habits.map((habit, index) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              index={index}
              onStart={onSessionStart}
              onEdit={() => setEditingHabit(habit)}
              onDelete={(id) => setDeleteConfirm(id)}
            />
          ))
        )}

        <motion.button
          onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-bg-border text-sm text-txt-muted hover:border-accent-cyan/30 hover:text-txt-secondary transition-all"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          + 添加新习惯
        </motion.button>
      </div>

      {/* Modals */}
      {showAdd && <AddHabitModal onSave={handleAdd} onClose={() => setShowAdd(false)} />}
      {editingHabit && (
        <AddHabitModal
          onSave={handleEdit}
          onClose={() => setEditingHabit(null)}
          initial={{
            name: editingHabit.name,
            icon: editingHabit.icon,
            target_url: editingHabit.target_url,
            target_app: editingHabit.target_app,
            daily_goal_m: editingHabit.daily_goal_m
          }}
        />
      )}

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="p-5 w-[280px] text-center rounded-2xl bg-bg-card shadow-xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <p className="text-sm text-txt-primary mb-4">确定要删除这个习惯吗？</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 rounded-xl text-sm text-txt-secondary bg-bg-elevated border border-bg-border hover:border-txt-muted/30 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2 rounded-xl text-sm text-danger bg-danger/15 border border-danger/30 hover:bg-danger/25 transition-colors"
                >
                  删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '🌙 深夜好'
  if (hour < 12) return '☀️ 早上好'
  if (hour < 18) return '🌤 下午好'
  return '🌙 晚上好'
}

function formatTotalTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default Dashboard
