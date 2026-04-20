import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { shouldReduceMotion } from '../lib/motionPrefs'

interface SessionStopBurstProps {
  show: boolean
  onComplete?: () => void
  color?: string
}

const PARTICLE_COUNT = 10

export function SessionStopBurst(props: SessionStopBurstProps): JSX.Element | null {
  const { show, onComplete, color = '#22d3ee' } = props
  const [active, setActive] = useState(false)
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    if (!show) return
    // 每次触发时重新读取偏好
    const r = shouldReduceMotion()
    setReduce(r)
    setActive(true)

    const duration = r ? 200 : 1200
    const timer = setTimeout(() => {
      setActive(false)
      onComplete?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [show, onComplete])

  if (!active) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    )
  }

  // 减弱动画分支：0.2s 简单 fade
  if (reduce) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <AnimatePresence>
          <motion.div
            key="reduce-burst"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <StarIcon color={color} size={32} />
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // 正常动画：粒子爆发
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i * (360 / PARTICLE_COUNT) * Math.PI) / 180
    const distance = 120 + Math.random() * 60 // 120-180px
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance
    return { id: i, x, y }
  })

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <AnimatePresence>
        <div key="burst-root" className="relative">
          {/* 中心 star with 光晕 */}
          <motion.div
            key="burst-star"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.4, 1],
              opacity: [0, 1, 0],
              boxShadow: [
                `0 0 0px 0px ${color}00`,
                `0 0 30px 12px ${color}80`,
                `0 0 60px 24px ${color}00`
              ]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut', times: [0, 0.3, 1] }}
            style={{ borderRadius: '50%' }}
          >
            <StarIcon color={color} size={36} />
          </motion.div>

          {/* 10 粒星尘 */}
          {particles.map(p => (
            <motion.div
              key={`particle-${p.id}`}
              className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
              initial={{ x: -4, y: -4, opacity: 1, scale: 1 }}
              animate={{
                x: p.x - 4,
                y: p.y - 4,
                opacity: [1, 0.3, 0],
                scale: [1, 0.7, 0.4]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}

function StarIcon({ color, size }: { color: string; size: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export default SessionStopBurst
