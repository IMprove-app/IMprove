import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface Props {
  defaultDeckId?: string
  defaultDeckName?: string
  onDone: () => void
}

interface CardInput {
  front: string
  back: string
}

function BatchAddCards({ defaultDeckId, defaultDeckName, onDone }: Props): JSX.Element {
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState<string>(defaultDeckId || '')
  const [newDeckName, setNewDeckName] = useState('')
  const [showNewDeck, setShowNewDeck] = useState(false)
  const [cards, setCards] = useState<CardInput[]>([{ front: '', back: '' }])
  const [saving, setSaving] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [mode, setMode] = useState<'single' | 'bulk'>('single')

  useEffect(() => {
    window.api.listDecks().then(list => {
      setDecks(list)
      if (!defaultDeckId && list.length > 0) {
        setSelectedDeckId(list[0].id)
      }
    })
  }, [defaultDeckId])

  const addRow = () => setCards(prev => [...prev, { front: '', back: '' }])

  const updateCard = (idx: number, field: 'front' | 'back', val: string) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c))
  }

  const removeRow = (idx: number) => {
    if (cards.length <= 1) return
    setCards(prev => prev.filter((_, i) => i !== idx))
  }

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return
    const deck = await window.api.createDeck({ id: crypto.randomUUID(), name: newDeckName.trim() })
    setDecks(prev => [...prev, deck])
    setSelectedDeckId(deck.id)
    setShowNewDeck(false)
    setNewDeckName('')
  }

  const parseBulkText = (): CardInput[] => {
    // Format: each line is "front | back" or "front\tback"
    return bulkText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const sep = line.includes('|') ? '|' : '\t'
        const parts = line.split(sep)
        return {
          front: (parts[0] || '').trim(),
          back: (parts.slice(1).join(sep) || '').trim()
        }
      })
      .filter(c => c.front && c.back)
  }

  const handleSave = async () => {
    let deckId = selectedDeckId
    if (!deckId) return

    const cardsToAdd = mode === 'bulk' ? parseBulkText() : cards.filter(c => c.front.trim() && c.back.trim())
    if (cardsToAdd.length === 0) return

    setSaving(true)
    const batch = cardsToAdd.map(c => ({
      id: crypto.randomUUID(),
      deck_id: deckId,
      front: c.front.trim(),
      back: c.back.trim()
    }))
    await window.api.createCardsBatch(batch)
    setSaving(false)
    onDone()
  }

  const validCount = mode === 'bulk'
    ? parseBulkText().length
    : cards.filter(c => c.front.trim() && c.back.trim()).length

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-5"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onDone}
          className="w-8 h-8 rounded-lg bg-bg-elevated border border-bg-border flex items-center justify-center text-txt-secondary hover:text-txt-primary transition-colors"
        >
          ←
        </button>
        <h1 className="text-lg font-bold">添加卡片</h1>
      </div>

      {/* Deck selector */}
      <div className="glass-card p-3 mb-4">
        <label className="text-[10px] text-txt-muted mb-1.5 block">选择卡片集</label>
        {showNewDeck ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateDeck()}
              placeholder="新卡片集名称..."
              className="flex-1 bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-txt-primary outline-none"
            />
            <motion.button
              onClick={handleCreateDeck}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
              whileTap={{ scale: 0.95 }}
            >
              创建
            </motion.button>
            <motion.button
              onClick={() => setShowNewDeck(false)}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-bg-elevated text-txt-muted border border-bg-border"
              whileTap={{ scale: 0.95 }}
            >
              取消
            </motion.button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={selectedDeckId}
              onChange={e => setSelectedDeckId(e.target.value)}
              className="flex-1 bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-txt-primary outline-none appearance-none"
            >
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <motion.button
              onClick={() => setShowNewDeck(true)}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-bg-elevated text-txt-muted border border-bg-border hover:text-accent-cyan"
              whileTap={{ scale: 0.95 }}
            >
              + 新建
            </motion.button>
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
            mode === 'single'
              ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20'
              : 'bg-bg-elevated text-txt-muted border-bg-border'
          }`}
        >
          逐条添加
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
            mode === 'bulk'
              ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20'
              : 'bg-bg-elevated text-txt-muted border-bg-border'
          }`}
        >
          批量粘贴
        </button>
      </div>

      {mode === 'single' ? (
        <div className="space-y-3 mb-4">
          {cards.map((card, idx) => (
            <motion.div
              key={idx}
              className="glass-card p-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-txt-muted">卡片 {idx + 1}</span>
                {cards.length > 1 && (
                  <button
                    onClick={() => removeRow(idx)}
                    className="text-[10px] text-txt-muted hover:text-danger"
                  >
                    删除
                  </button>
                )}
              </div>
              <input
                value={card.front}
                onChange={e => updateCard(idx, 'front', e.target.value)}
                placeholder="正面（问题）"
                className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-txt-primary outline-none mb-1.5 placeholder:text-txt-muted"
              />
              <input
                value={card.back}
                onChange={e => updateCard(idx, 'back', e.target.value)}
                placeholder="反面（答案）"
                className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-txt-primary outline-none placeholder:text-txt-muted"
              />
            </motion.div>
          ))}
          <button
            onClick={addRow}
            className="w-full py-2 rounded-xl border border-dashed border-bg-border text-txt-muted hover:text-accent-cyan hover:border-accent-cyan/30 transition-colors text-xs"
          >
            + 再加一张
          </button>
        </div>
      ) : (
        <div className="glass-card p-3 mb-4">
          <p className="text-[10px] text-txt-muted mb-2">
            每行一张卡片，用 | 或 Tab 分隔正面和反面
          </p>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder={"苹果 | Apple\n香蕉 | Banana\n葡萄 | Grape"}
            className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs text-txt-primary outline-none resize-none font-mono"
            rows={8}
          />
          {bulkText && (
            <p className="text-[10px] text-txt-muted mt-1.5">
              识别到 {parseBulkText().length} 张有效卡片
            </p>
          )}
        </div>
      )}

      {/* Save button */}
      <motion.button
        onClick={handleSave}
        disabled={saving || validCount === 0 || !selectedDeckId}
        className="w-full btn-glow text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
        whileHover={{ scale: validCount > 0 ? 1.02 : 1 }}
        whileTap={{ scale: validCount > 0 ? 0.98 : 1 }}
      >
        {saving ? '保存中...' : `保存 ${validCount} 张卡片`}
      </motion.button>
    </motion.div>
  )
}

export default BatchAddCards
