import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DeckView from './DeckView'
import ReviewPage from './ReviewPage'

function CardsPage(): JSX.Element {
  const [decks, setDecks] = useState<{ id: string; name: string; cardCount: number }[]>([])
  const [dueCount, setDueCount] = useState(0)
  const [showNewDeck, setShowNewDeck] = useState(false)
  const [newDeckName, setNewDeckName] = useState('')
  const [editingDeck, setEditingDeck] = useState<{ id: string; name: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [selectedDeck, setSelectedDeck] = useState<{ id: string; name: string } | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadDecks = async () => {
    const allDecks = await window.api.listDecks()
    const withCounts = await Promise.all(
      allDecks.map(async (d) => {
        const cards = await window.api.listCards(d.id)
        return { id: d.id, name: d.name, cardCount: cards.length }
      })
    )
    setDecks(withCounts)
    const count = await window.api.getDueCardCount()
    setDueCount(count)
  }

  useEffect(() => { loadDecks() }, [])

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return
    await window.api.createDeck({ id: crypto.randomUUID(), name: newDeckName.trim() })
    setNewDeckName('')
    setShowNewDeck(false)
    loadDecks()
  }

  const handleRenameDeck = async () => {
    if (!editingDeck || !editName.trim()) return
    await window.api.updateDeck(editingDeck.id, { name: editName.trim() })
    setEditingDeck(null)
    setEditName('')
    loadDecks()
  }

  const handleDeleteDeck = async (id: string) => {
    await window.api.deleteDeck(id)
    setDeleteConfirm(null)
    loadDecks()
  }

  if (reviewing) {
    return <ReviewPage onBack={() => { setReviewing(false); loadDecks() }} />
  }

  if (selectedDeck) {
    return (
      <DeckView
        deckId={selectedDeck.id}
        deckName={selectedDeck.name}
        onBack={() => { setSelectedDeck(null); loadDecks() }}
      />
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
        <h1 className="text-xl font-bold">记忆卡片</h1>
      </div>

      {/* Review reminder */}
      {dueCount > 0 && (
        <motion.div
          className="glass-card p-4 mb-4 border-l-2 border-l-streak"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-txt-primary">
                今日待复习
              </p>
              <p className="text-xs text-txt-muted mt-0.5">
                {dueCount} 张卡片需要复习
              </p>
            </div>
            <motion.button
              onClick={() => setReviewing(true)}
              className="btn-glow text-xs py-2 px-4"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              开始复习
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Deck list */}
      <div className="space-y-2 mb-4">
        {decks.map((deck, idx) => (
          <motion.div
            key={deck.id}
            className="glass-card p-3 flex items-center justify-between"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04 }}
          >
            <button
              className="flex-1 text-left"
              onClick={() => setSelectedDeck({ id: deck.id, name: deck.name })}
            >
              <p className="text-sm font-medium text-txt-primary">{deck.name}</p>
              <p className="text-[10px] text-txt-muted">{deck.cardCount} 张卡片</p>
            </button>
            <div className="flex gap-1">
              <button
                onClick={() => { setEditingDeck(deck); setEditName(deck.name) }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-txt-secondary hover:bg-bg-elevated transition-colors text-xs"
              >
                ✏️
              </button>
              <button
                onClick={() => setDeleteConfirm(deck.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-danger hover:bg-danger/10 transition-colors text-xs"
              >
                🗑
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add deck button */}
      {showNewDeck ? (
        <div className="glass-card p-3">
          <input
            autoFocus
            value={newDeckName}
            onChange={e => setNewDeckName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateDeck()}
            placeholder="输入卡片集名称..."
            className="w-full bg-transparent text-sm text-txt-primary placeholder:text-txt-muted outline-none mb-2"
          />
          <div className="flex gap-2">
            <motion.button
              onClick={handleCreateDeck}
              className="flex-1 text-xs py-1.5 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
              whileTap={{ scale: 0.95 }}
            >
              创建
            </motion.button>
            <motion.button
              onClick={() => { setShowNewDeck(false); setNewDeckName('') }}
              className="flex-1 text-xs py-1.5 rounded-lg bg-bg-elevated text-txt-muted border border-bg-border"
              whileTap={{ scale: 0.95 }}
            >
              取消
            </motion.button>
          </div>
        </div>
      ) : (
        <motion.button
          onClick={() => setShowNewDeck(true)}
          className="w-full py-3 rounded-xl border border-dashed border-bg-border text-txt-muted hover:text-accent-cyan hover:border-accent-cyan/30 transition-colors text-sm"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          + 新建卡片集
        </motion.button>
      )}

      {/* Rename modal */}
      <AnimatePresence>
        {editingDeck && (
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
              <h3 className="text-sm font-semibold mb-3">重命名卡片集</h3>
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRenameDeck()}
                className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-txt-primary outline-none mb-3"
              />
              <div className="flex gap-2">
                <motion.button
                  onClick={handleRenameDeck}
                  className="flex-1 text-xs py-2 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                  whileTap={{ scale: 0.95 }}
                >
                  确定
                </motion.button>
                <motion.button
                  onClick={() => setEditingDeck(null)}
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
              <p className="text-xs text-txt-muted mb-4">删除后卡片集及其所有卡片将无法恢复</p>
              <div className="flex gap-2">
                <motion.button
                  onClick={() => handleDeleteDeck(deleteConfirm)}
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

export default CardsPage
