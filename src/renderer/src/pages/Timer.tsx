import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ActiveSession } from '../App'

interface Props {
  session: ActiveSession
  onStop: () => void
}

function Timer({ session, onStop }: Props): JSX.Element {
  const [elapsed, setElapsed] = useState(session.todaySeconds || 0)
  const [isPaused, setIsPaused] = useState(false)
  const [showGoalMet, setShowGoalMet] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickCountRef = useRef(0)
  const goalMetRef = useRef(false)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!isPaused) {
        setElapsed(prev => {
          const next = prev + 1
          tickCountRef.current++
          if (tickCountRef.current % 30 === 0) {
            window.api.tickSession(session.sessionId, next - (session.todaySeconds || 0), 0)
          }
          if (!goalMetRef.current && next >= session.dailyGoalM * 60) {
            goalMetRef.current = true
            setShowGoalMet(true)
            setTimeout(() => setShowGoalMet(false), 3000)
          }
          return next
        })
      }
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, session.sessionId, session.dailyGoalM])

  const handleStop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const sessionSeconds = elapsed - (session.todaySeconds || 0)
    await window.api.stopSession(session.sessionId, sessionSeconds)
    onStop()
  }

  const togglePause = () => setIsPaused(p => !p)

  const goalSec = session.dailyGoalM * 60
  const progress = Math.min((elapsed / goalSec) * 100, 100)
  const isGoalMet = elapsed >= goalSec

  const radius = 90
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (progress / 100) * circumference

  return (
    <motion.div
      className="flex-1 flex flex-col items-center justify-center px-5"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Habit info */}
      <motion.div
        className="text-center mb-5"
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
      >
        <span className="text-3xl">{session.habitIcon}</span>
        <h2 className="text-base font-semibold text-txt-primary mt-1.5">{session.habitName}</h2>
      </motion.div>

      {/* Timer ring */}
      <motion.div
        className="relative mb-5"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg width="210" height="210" className="transform -rotate-90">
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#007AFF" />
              <stop offset="100%" stopColor="#5856D6" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="105" cy="105" r={radius} fill="none" stroke="#E5E5EA" strokeWidth="5" />
          <circle
            cx="105" cy="105" r={radius} fill="none"
            stroke={isGoalMet ? '#34C759' : 'url(#timerGradient)'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            filter="url(#glow)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-mono text-4xl font-medium text-txt-primary tracking-tight"
            key={Math.floor(elapsed / 60)}
            initial={{ y: -2 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {formatElapsed(elapsed)}
          </motion.span>
          <span className="text-xs text-txt-muted mt-2 font-mono">
            目标 {String(session.dailyGoalM).padStart(2, '0')}:00
          </span>
          <AnimatePresence>
            {isPaused && (
              <motion.span
                className="text-xs text-streak mt-1"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                ⏸ 已暂停
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Status indicator */}
      <motion.div
        className="flex items-center gap-2 mb-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-streak' : 'bg-accent-cyan animate-pulse-glow'}`} />
        <span className="text-xs text-txt-secondary">
          {isPaused ? '计时已暂停' : '正在记录学习时间'}
        </span>
      </motion.div>

      {/* Controls */}
      <motion.div
        className="flex gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <motion.button
          onClick={togglePause}
          className="px-8 py-3 rounded-xl text-sm font-medium border border-bg-border text-txt-secondary bg-bg-elevated hover:bg-bg-card transition-colors"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {isPaused ? '▶ 继续' : '⏸ 暂停'}
        </motion.button>
        <motion.button
          onClick={handleStop}
          className="px-8 py-3 rounded-xl text-sm font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-colors"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          ⏹ 结束
        </motion.button>
      </motion.div>

      {/* Goal reached celebration */}
      <AnimatePresence>
        {showGoalMet && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <div className="text-6xl mb-2">✨</div>
              <div className="text-2xl font-bold text-success">目标达成！</div>
              <div className="text-sm text-txt-secondary mt-1">太棒了，继续保持！</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isGoalMet && !showGoalMet && (
        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-success text-sm font-medium">✨ 今日目标已达成！</p>
          <p className="text-xs text-txt-muted mt-1">继续学习或点击结束保存记录</p>
        </motion.div>
      )}
    </motion.div>
  )
}

function formatElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export default Timer
