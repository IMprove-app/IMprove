import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { badgeByCode } from '../data/badges'

interface QueuedAchievement {
  id: number
  code: string
}

interface XpPing {
  id: number
  stars: number
}

function AchievementToast(): JSX.Element | null {
  const [queue, setQueue] = useState<QueuedAchievement[]>([])
  const [current, setCurrent] = useState<QueuedAchievement | null>(null)
  const [xpPing, setXpPing] = useState<XpPing | null>(null)
  const idCounterRef = useRef(0)
  const prevTotalStarsRef = useRef<number | null>(null)

  // Seed previous total_stars so first update doesn't show the whole accumulated value as a delta
  useEffect(() => {
    window.api.getProgress().then(p => {
      prevTotalStarsRef.current = p.total_stars
    }).catch(() => { /* noop */ })
  }, [])

  // Subscribe to events
  useEffect(() => {
    const unsubs: Array<() => void> = [
      window.api.onAchievementUnlocked(data => {
        if (!data?.code) return
        idCounterRef.current += 1
        const id = idCounterRef.current
        setQueue(prev => [...prev, { id, code: data.code }])
      }),
      window.api.onProgressUpdated(data => {
        const prev = prevTotalStarsRef.current
        prevTotalStarsRef.current = data.total_stars
        if (prev === null) return
        const delta = data.total_stars - prev
        if (delta > 0) {
          idCounterRef.current += 1
          const id = idCounterRef.current
          setXpPing({ id, stars: delta })
        }
      })
    ]

    return () => {
      unsubs.forEach(u => {
        try {
          u()
        } catch {
          /* noop */
        }
      })
    }
  }, [])

  // Drive the queue: show next when current is null
  useEffect(() => {
    if (current || queue.length === 0) return
    const next = queue[0]
    setCurrent(next)
    setQueue(rest => rest.slice(1))
    const timer = setTimeout(() => {
      setCurrent(null)
    }, 2500)
    return () => clearTimeout(timer)
  }, [queue, current])

  // Auto-dismiss xpPing after 1.5s
  useEffect(() => {
    if (!xpPing) return
    const timer = setTimeout(() => {
      setXpPing(prev => (prev && prev.id === xpPing.id ? null : prev))
    }, 1500)
    return () => clearTimeout(timer)
  }, [xpPing])

  const badge = current ? badgeByCode(current.code) : null

  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-[60] flex flex-col items-center px-4">
      {/* XP ping (小型迷你通知) */}
      <AnimatePresence>
        {xpPing && (
          <motion.div
            key={`xp-${xpPing.id}`}
            className="mt-2 px-3 py-1 rounded-full bg-bg-card/95 border border-accent-cyan/30 shadow-[0_0_10px_rgba(34,211,238,0.25)] text-[11px] text-accent-cyan font-medium backdrop-blur"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >
            +{xpPing.stars} 星光
          </motion.div>
        )}
      </AnimatePresence>

      {/* Achievement toast */}
      <AnimatePresence>
        {current && badge && (
          <motion.button
            key={`ach-${current.id}`}
            type="button"
            onClick={() => setCurrent(null)}
            className="pointer-events-auto mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-card/95 border border-accent-cyan/40 shadow-[0_0_20px_rgba(34,211,238,0.35)] backdrop-blur max-w-sm w-full text-left"
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center border"
              style={{
                backgroundColor: badge.color,
                borderColor: 'rgba(34,211,238,0.6)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-txt-primary truncate">
                解锁勋章 · {badge.name}
              </p>
              <p className="text-[11px] text-txt-secondary italic mt-0.5 truncate">
                {badge.lore}
              </p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AchievementToast
