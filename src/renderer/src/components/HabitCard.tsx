import { motion } from 'framer-motion'
import { ActiveSession } from '../App'

interface HabitWithStats {
  id: string
  name: string
  icon: string
  target_url: string
  target_app: string
  daily_goal_m: number
  todaySeconds: number
  streak: number
}

interface Props {
  habit: HabitWithStats
  index: number
  onStart: (session: ActiveSession) => void
  onEdit: (habit: HabitWithStats) => void
  onDelete: (id: string) => void
}

const ICONS: Record<string, string> = {
  microphone: '🎤',
  headphones: '🎧',
  code: '💻',
  'book-open': '📖',
  brain: '🧠',
  dumbbell: '💪',
  pencil: '✏️',
  globe: '🌍',
  target: '🎯',
  music: '🎵',
  palette: '🎨',
  rocket: '🚀'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h ${rm}m`
}

function HabitCard({ habit, index, onStart, onEdit, onDelete }: Props): JSX.Element {
  const todayMin = Math.floor(habit.todaySeconds / 60)
  const goalMin = habit.daily_goal_m
  const progress = Math.min((todayMin / goalMin) * 100, 100)
  const isComplete = todayMin >= goalMin
  const icon = ICONS[habit.icon] || ICONS.target
  const link = habit.target_url || habit.target_app || ''
  const linkDisplay = link.length > 30 ? link.slice(0, 30) + '...' : link

  const handleStart = async () => {
    const session = await window.api.startSession(habit.id)
    onStart({
      sessionId: session.id,
      habitId: habit.id,
      habitName: habit.name,
      habitIcon: icon,
      startedAt: Date.now(),
      dailyGoalM: habit.daily_goal_m,
      todaySeconds: habit.todaySeconds
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="glass-card p-4 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <motion.span
            className="text-2xl"
            whileHover={{ scale: 1.2, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            {icon}
          </motion.span>
          <div>
            <h3 className="text-sm font-semibold text-txt-primary">{habit.name}</h3>
            {linkDisplay && (
              <p className="text-xs text-txt-muted mt-0.5 truncate max-w-[200px]">{linkDisplay}</p>
            )}
          </div>
        </div>
        {habit.streak > 0 && (
          <motion.div
            className="flex items-center gap-1 text-streak text-xs font-semibold"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, delay: index * 0.06 + 0.2 }}
          >
            <span className={habit.streak >= 7 ? 'animate-pulse-glow' : ''}>🔥</span>
            {habit.streak}天
          </motion.div>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-txt-secondary">
          今日 <span className="font-mono text-txt-primary">{formatTime(habit.todaySeconds)}</span>
          <span className="text-txt-muted"> / {goalMin}m</span>
        </span>
        {isComplete && (
          <motion.span
            className="text-xs text-success font-medium"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            ✓ 已完成
          </motion.span>
        )}
      </div>

      <div className="progress-track mb-4">
        <motion.div
          className={`progress-fill ${isComplete ? 'complete' : ''}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, delay: index * 0.06 + 0.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(habit)}
            className="text-xs text-txt-muted hover:text-txt-secondary transition-colors"
          >
            编辑
          </button>
          <button
            onClick={() => onDelete(habit.id)}
            className="text-xs text-txt-muted hover:text-danger transition-colors"
          >
            删除
          </button>
        </div>
        {!isComplete ? (
          <motion.button
            onClick={handleStart}
            className="btn-glow text-xs py-2 px-5"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            ▶ 开始
          </motion.button>
        ) : (
          <motion.button
            onClick={handleStart}
            className="text-xs py-2 px-5 rounded-xl border border-success/30 text-success bg-success/10 hover:bg-success/20 transition-colors cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            继续
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

export default HabitCard
