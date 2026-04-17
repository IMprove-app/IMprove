import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import BatchAddCards from './BatchAddCards'

interface Props {
  habitName: string
  onDone: () => void
  onSkip: () => void
}

function PostSessionCards({ habitName, onDone, onSkip }: Props): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [defaultDeckId, setDefaultDeckId] = useState<string | undefined>()

  useEffect(() => {
    // Find or create a deck matching the habit name
    window.api.listDecks().then(async (decks) => {
      const match = decks.find(d => d.name === habitName)
      if (match) {
        setDefaultDeckId(match.id)
      } else {
        // Auto-create a deck with the habit name
        const deck = await window.api.createDeck({ id: crypto.randomUUID(), name: habitName })
        setDefaultDeckId(deck.id)
      }
    })
  }, [habitName])

  if (adding && defaultDeckId) {
    return (
      <BatchAddCards
        defaultDeckId={defaultDeckId}
        defaultDeckName={habitName}
        onDone={onDone}
      />
    )
  }

  return (
    <motion.div
      className="flex-1 flex flex-col items-center justify-center px-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="text-center"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
      >
        <div className="text-4xl mb-3">📝</div>
        <h2 className="text-lg font-bold text-txt-primary mb-2">计时结束</h2>
        <p className="text-sm text-txt-muted mb-1">
          需要添加记忆卡片吗？
        </p>
        <p className="text-xs text-txt-muted mb-6">
          卡片将添加到「{habitName}」卡片集
        </p>

        <div className="flex gap-3">
          <motion.button
            onClick={() => setAdding(true)}
            className="btn-glow text-sm py-2.5 px-6"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            添加卡片
          </motion.button>
          <motion.button
            onClick={onSkip}
            className="px-6 py-2.5 rounded-xl text-sm font-medium border border-bg-border text-txt-secondary bg-bg-elevated hover:bg-bg-card transition-colors"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            跳过
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default PostSessionCards
