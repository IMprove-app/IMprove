import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onBack: () => void
}

interface Card {
  id: string
  deck_id: string
  front: string
  back: string
  review_stage: number
}

function ReviewPage({ onBack }: Props): JSX.Element {
  const [queue, setQueue] = useState<Card[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(0)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    loadDueCards()
  }, [])

  const loadDueCards = async () => {
    const cards = await window.api.getDueCards()
    // Shuffle for variety
    const shuffled = cards.sort(() => Math.random() - 0.5)
    setQueue(shuffled)
    setTotal(shuffled.length)
    setLoading(false)
    if (shuffled.length === 0) setDone(true)
  }

  const currentCard = queue[currentIdx]

  const handleRemembered = async () => {
    if (!currentCard) return
    await window.api.reviewRemembered(currentCard.id)
    setCompleted(c => c + 1)
    advance()
  }

  const handleForgot = async () => {
    if (!currentCard) return
    await window.api.reviewForgot(currentCard.id)
    // Add card back to end of queue for repeat
    setQueue(prev => [...prev, currentCard])
    advance()
  }

  const advance = () => {
    setFlipped(false)
    const nextIdx = currentIdx + 1
    if (nextIdx >= queue.length) {
      // Check if there are more cards added (forgot cards)
      // Since we push forgot cards, queue.length may have grown
      setDone(true)
    } else {
      setCurrentIdx(nextIdx)
    }
  }

  // Re-check done state when queue updates
  useEffect(() => {
    if (!loading && currentIdx >= queue.length && queue.length > 0) {
      setDone(true)
    }
  }, [queue, currentIdx, loading])

  if (loading) {
    return (
      <motion.div className="flex-1 flex items-center justify-center text-txt-muted text-sm">
        加载中...
      </motion.div>
    )
  }

  if (done) {
    return (
      <motion.div
        className="flex-1 flex flex-col items-center justify-center px-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="text-center"
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
        >
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-txt-primary mb-2">
            {total === 0 ? '今日无需复习' : '复习完成！'}
          </h2>
          {total > 0 && (
            <p className="text-sm text-txt-muted mb-6">
              共复习 {completed} 张卡片
            </p>
          )}
          <motion.button
            onClick={onBack}
            className="btn-glow text-sm py-2.5 px-8"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            返回
          </motion.button>
        </motion.div>
      </motion.div>
    )
  }

  const progress = total > 0 ? (completed / total) * 100 : 0

  return (
    <motion.div
      className="flex-1 flex flex-col px-5 pt-4 pb-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg bg-bg-elevated border border-bg-border flex items-center justify-center text-txt-secondary hover:text-txt-primary transition-colors"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">复习</h1>
          <p className="text-[10px] text-txt-muted">
            {completed}/{total} 已完成 · 剩余 {queue.length - currentIdx - 1} 张
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-track mb-6">
        <motion.div
          className="progress-fill"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentCard.id}-${currentIdx}`}
            className="w-full max-w-sm"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="glass-card p-6 min-h-[200px] flex flex-col items-center justify-center cursor-pointer select-none"
              onClick={() => setFlipped(!flipped)}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-[10px] text-txt-muted mb-3">
                {flipped ? '答案' : '问题'} · 点击翻转
              </span>
              <motion.p
                key={flipped ? 'back' : 'front'}
                className="text-base text-txt-primary text-center leading-relaxed whitespace-pre-wrap"
                initial={{ opacity: 0, rotateY: 90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                transition={{ duration: 0.2 }}
              >
                {flipped ? currentCard.back : currentCard.front}
              </motion.p>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Action buttons - only show when flipped */}
        <AnimatePresence>
          {flipped && (
            <motion.div
              className="flex gap-4 mt-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <motion.button
                onClick={handleForgot}
                className="px-8 py-3 rounded-xl text-sm font-medium bg-danger/15 text-danger border border-danger/30"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                忘记了
              </motion.button>
              <motion.button
                onClick={handleRemembered}
                className="px-8 py-3 rounded-xl text-sm font-medium bg-success/15 text-success border border-success/30"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                记住了
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {!flipped && (
          <p className="text-xs text-txt-muted mt-6">点击卡片查看答案</p>
        )}
      </div>
    </motion.div>
  )
}

export default ReviewPage
