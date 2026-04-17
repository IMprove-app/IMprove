import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BatchAddCards from '../components/BatchAddCards'

interface Props {
  deckId: string
  deckName: string
  onBack: () => void
}

interface Card {
  id: string
  front: string
  back: string
  review_stage: number
  next_review_at: string
}

const STAGE_LABELS = ['新卡片', '1天后', '2天后', '4天后', '7天后', '15天后', '30天后', '已掌握']

function DeckView({ deckId, deckName, onBack }: Props): JSX.Element {
  const [cards, setCards] = useState<Card[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [flippedId, setFlippedId] = useState<string | null>(null)
  const [editCard, setEditCard] = useState<Card | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadCards = async () => {
    const list = await window.api.listCards(deckId)
    setCards(list)
  }

  useEffect(() => { loadCards() }, [deckId])

  const handleDelete = async (id: string) => {
    await window.api.deleteCard(id)
    setDeleteConfirm(null)
    loadCards()
  }

  const handleEditSave = async () => {
    if (!editCard || !editFront.trim() || !editBack.trim()) return
    await window.api.updateCard(editCard.id, { front: editFront.trim(), back: editBack.trim() })
    setEditCard(null)
    loadCards()
  }

  if (showAdd) {
    return (
      <BatchAddCards
        defaultDeckId={deckId}
        defaultDeckName={deckName}
        onDone={() => { setShowAdd(false); loadCards() }}
      />
    )
  }

  const mastered = cards.filter(c => c.review_stage >= 7).length
  const learning = cards.length - mastered

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-5"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg bg-bg-elevated border border-bg-border flex items-center justify-center text-txt-secondary hover:text-txt-primary transition-colors"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{deckName}</h1>
          <p className="text-[10px] text-txt-muted">
            {cards.length} 张卡片 · {learning} 学习中 · {mastered} 已掌握
          </p>
        </div>
      </div>

      {/* Card list */}
      <div className="space-y-2 mb-4">
        {cards.map((card, idx) => (
          <motion.div
            key={card.id}
            className="glass-card p-3 cursor-pointer"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => setFlippedId(flippedId === card.id ? null : card.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-txt-primary truncate">
                  {flippedId === card.id ? card.back : card.front}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    card.review_stage >= 7
                      ? 'bg-success/10 text-success'
                      : 'bg-accent-cyan/10 text-accent-cyan'
                  }`}>
                    {STAGE_LABELS[card.review_stage]}
                  </span>
                  <span className="text-[9px] text-txt-muted">
                    {flippedId === card.id ? '正面 ↑ 点击翻转' : '反面 ↑ 点击翻转'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { setEditCard(card); setEditFront(card.front); setEditBack(card.back) }}
                  className="w-6 h-6 rounded flex items-center justify-center text-txt-muted hover:text-txt-secondary text-[10px]"
                >
                  ✏️
                </button>
                <button
                  onClick={() => setDeleteConfirm(card.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-txt-muted hover:text-danger text-[10px]"
                >
                  🗑
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="text-center py-8 text-txt-muted text-sm">
          还没有卡片，点击下方按钮添加
        </div>
      )}

      <motion.button
        onClick={() => setShowAdd(true)}
        className="w-full py-3 rounded-xl border border-dashed border-bg-border text-txt-muted hover:text-accent-cyan hover:border-accent-cyan/30 transition-colors text-sm"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        + 批量添加卡片
      </motion.button>

      {/* Edit modal */}
      <AnimatePresence>
        {editCard && (
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
              <h3 className="text-sm font-semibold mb-3">编辑卡片</h3>
              <label className="text-[10px] text-txt-muted mb-1 block">正面（问题）</label>
              <textarea
                autoFocus
                value={editFront}
                onChange={e => setEditFront(e.target.value)}
                className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-txt-primary outline-none mb-2 resize-none"
                rows={2}
              />
              <label className="text-[10px] text-txt-muted mb-1 block">反面（答案）</label>
              <textarea
                value={editBack}
                onChange={e => setEditBack(e.target.value)}
                className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-txt-primary outline-none mb-3 resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <motion.button
                  onClick={handleEditSave}
                  className="flex-1 text-xs py-2 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                  whileTap={{ scale: 0.95 }}
                >
                  保存
                </motion.button>
                <motion.button
                  onClick={() => setEditCard(null)}
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
              <h3 className="text-sm font-semibold mb-2">确认删除卡片？</h3>
              <div className="flex gap-2 mt-3">
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

export default DeckView
