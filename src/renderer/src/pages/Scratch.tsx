import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface SnippetFolderData {
  id: string
  name: string
}

interface DeckData {
  id: string
  name: string
}

type SaveMode = null | 'snippet' | 'card'

interface CardPreview {
  front: string
  back: string
}

function parseCards(content: string): CardPreview[] {
  const trimmed = content.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/^---\s*$/m).map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) {
    return [{ front: trimmed, back: '' }]
  }
  const cards: CardPreview[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const front = parts[i] ?? ''
    const back = parts[i + 1] ?? ''
    if (front) cards.push({ front, back })
  }
  return cards
}

function firstLine(s: string): string {
  const t = (s || '').trim()
  if (!t) return ''
  const nl = t.indexOf('\n')
  return (nl === -1 ? t : t.slice(0, nl)).slice(0, 40)
}

function Scratch(): JSX.Element {
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [restored, setRestored] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  // Save flow
  const [saveMode, setSaveMode] = useState<SaveMode>(null)
  const [folders, setFolders] = useState<SnippetFolderData[]>([])
  const [decks, setDecks] = useState<DeckData[]>([])
  const [snippetTitle, setSnippetTitle] = useState('')
  const [snippetFolderId, setSnippetFolderId] = useState<string>('')
  const [deckId, setDeckId] = useState<string>('')
  const [newDeckName, setNewDeckName] = useState('')
  const [createNewDeck, setCreateNewDeck] = useState(false)

  const textRef = useRef<HTMLTextAreaElement>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cardPreviews = useMemo(() => parseCards(content), [content])
  const cardCount = cardPreviews.length

  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => {
      document.body.style.background = prev
    }
  }, [])

  // Seed draft + pin state on mount.
  useEffect(() => {
    window.api.getScratchDraft().then(d => {
      if (d && d.length > 0) {
        setContent(d)
        setRestored(true)
        restoredTimerRef.current = setTimeout(() => setRestored(false), 3000)
      }
    }).catch(() => {})
    window.api.getScratchPinned().then(setPinned).catch(() => {})
    const off = window.api.onScratchPinnedChanged(setPinned)
    setTimeout(() => textRef.current?.focus(), 50)
    return () => {
      off()
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current)
    }
  }, [])

  // Debounced draft persistence (400ms).
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      window.api.setScratchDraft(content).catch(() => {})
    }, 400)
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [content])

  const showToast = (msg: string): void => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }

  const handleTogglePin = async (): Promise<void> => {
    const next = !pinned
    setPinned(next)
    await window.api.setScratchPinned(next)
  }

  const handleClose = (): void => {
    window.api.hideScratch()
  }

  const handleClearClick = (): void => {
    if (!content.trim()) {
      setContent('')
      return
    }
    setConfirmClear(true)
  }

  const doClear = async (): Promise<void> => {
    setContent('')
    setConfirmClear(false)
    await window.api.setScratchDraft('').catch(() => {})
    textRef.current?.focus()
  }

  const openSnippetSave = async (): Promise<void> => {
    if (!content.trim()) {
      showToast('内容为空')
      return
    }
    try {
      let list = (await window.api.listSnippetFolders()) as SnippetFolderData[]
      if (!list || list.length === 0) {
        const created = (await window.api.createSnippetFolder({ name: '默认' })) as SnippetFolderData
        list = [created]
      }
      setFolders(list)
      setSnippetFolderId(list[0]?.id ?? '')
      setSnippetTitle(firstLine(content))
      setSaveMode('snippet')
    } catch {
      showToast('加载文件夹失败')
    }
  }

  const openCardSave = async (): Promise<void> => {
    if (!content.trim()) {
      showToast('内容为空')
      return
    }
    try {
      const list = (await window.api.listDecks()) as DeckData[]
      setDecks(list)
      if (list.length === 0) {
        setCreateNewDeck(true)
        setNewDeckName('')
        setDeckId('')
      } else {
        setCreateNewDeck(false)
        setDeckId(list[0]!.id)
      }
      setSaveMode('card')
    } catch {
      showToast('加载牌组失败')
    }
  }

  const doSaveSnippet = async (): Promise<void> => {
    if (!snippetFolderId) return
    try {
      await window.api.createSnippet({
        title: snippetTitle.trim(),
        content,
        folder_id: snippetFolderId
      })
      const fname = folders.find(f => f.id === snippetFolderId)?.name ?? ''
      setContent('')
      await window.api.setScratchDraft('').catch(() => {})
      setSaveMode(null)
      showToast(fname ? `已保存到速贴 · ${fname}` : '已保存到速贴')
    } catch {
      showToast('保存失败')
    }
  }

  const doSaveCards = async (): Promise<void> => {
    if (cardPreviews.length === 0) return
    try {
      let targetDeckId = deckId
      if (createNewDeck) {
        const name = newDeckName.trim() || '新牌组'
        const id = crypto.randomUUID()
        await window.api.createDeck({ id, name })
        targetDeckId = id
      }
      if (!targetDeckId) return

      const cards = cardPreviews.map(c => ({
        id: crypto.randomUUID(),
        deck_id: targetDeckId,
        front: c.front,
        back: c.back
      }))
      await window.api.createCardsBatch(cards)

      const dname = createNewDeck
        ? newDeckName.trim() || '新牌组'
        : decks.find(d => d.id === targetDeckId)?.name ?? ''

      setContent('')
      await window.api.setScratchDraft('').catch(() => {})
      setSaveMode(null)
      showToast(`已添加 ${cards.length} 张卡片${dname ? ` · ${dname}` : ''}`)
    } catch {
      showToast('保存失败')
    }
  }

  // Esc hierarchy: confirmClear > saveMode > close
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (confirmClear) {
        e.preventDefault()
        setConfirmClear(false)
        return
      }
      if (saveMode) {
        e.preventDefault()
        setSaveMode(null)
        return
      }
      e.preventDefault()
      handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [confirmClear, saveMode])

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden rounded-2xl relative"
      style={{
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.22)',
        border: '1px solid rgba(0, 0, 0, 0.06)'
      }}
    >
      {/* Title bar */}
      <div
        className="titlebar flex items-center justify-between px-3 py-2 border-b border-bg-border"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-txt-secondary select-none truncate">
            草稿纸
          </span>
          {restored && (
            <span className="text-[10px] text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded">
              · 恢复草稿
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleTogglePin}
            title={pinned ? '取消置顶' : '置顶到最前'}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              pinned ? 'bg-accent-cyan/15 text-accent-cyan' : 'text-txt-secondary hover:bg-bg-elevated'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79L15 12V7h1a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1v5l-2.89 1.45A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
          <button
            onClick={handleClose}
            title="收起 (Esc)"
            className="w-7 h-7 rounded-md flex items-center justify-center text-txt-secondary hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="flex-1 min-h-0 px-3 py-2 flex flex-col">
        <textarea
          ref={textRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={'在此输入或粘贴内容...\n\n保存到卡片时，使用 --- 单独一行分隔正反面，可一次创建多张。'}
          className="flex-1 min-h-0 w-full text-xs px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 text-txt-primary placeholder:text-txt-muted resize-none font-mono"
          spellCheck={false}
        />
        <div className="flex items-center justify-between text-[10px] text-txt-muted px-1 pt-1.5 select-none">
          <span>{content.length} 字符</span>
          {cardCount > 0 && content.includes('---') && (
            <span>{cardCount} 张卡片预览</span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 border-t border-bg-border"
        style={{ flexShrink: 0 }}
      >
        <button
          onClick={openSnippetSave}
          disabled={!content.trim()}
          className="flex-1 h-8 text-[11px] font-medium rounded-md bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          保存到速贴
        </button>
        <button
          onClick={openCardSave}
          disabled={!content.trim()}
          className="flex-1 h-8 text-[11px] font-medium rounded-md bg-accent-violet/15 text-accent-violet hover:bg-accent-violet/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          保存到卡片
        </button>
        <button
          onClick={handleClearClick}
          title="清空"
          className="w-8 h-8 rounded-md flex items-center justify-center text-txt-secondary hover:bg-danger/10 hover:text-danger transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-14 left-1/2 -translate-x-1/2 text-[11px] px-3 py-1.5 rounded-md bg-black/80 text-white pointer-events-none"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm clear modal */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-center justify-center z-20"
            onClick={() => setConfirmClear(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl p-4 shadow-xl w-64"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-xs text-txt-primary mb-3">清空草稿纸？此操作不可撤销。</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 h-7 text-[11px] rounded-md bg-bg-elevated text-txt-secondary hover:bg-bg-border transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={doClear}
                  className="flex-1 h-7 text-[11px] rounded-md bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
                >
                  清空
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save-to-snippet modal */}
      <AnimatePresence>
        {saveMode === 'snippet' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-center justify-center z-20"
            onClick={() => setSaveMode(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-xl p-4 shadow-xl w-72"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-xs font-semibold text-txt-primary mb-2.5">保存到速贴</div>
              <input
                value={snippetTitle}
                onChange={e => setSnippetTitle(e.target.value)}
                placeholder="标题（可选）"
                className="w-full text-xs px-2 py-1.5 rounded-md bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 mb-2"
              />
              <select
                value={snippetFolderId}
                onChange={e => setSnippetFolderId(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded-md bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 mb-3"
              >
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setSaveMode(null)}
                  className="flex-1 h-7 text-[11px] rounded-md bg-bg-elevated text-txt-secondary hover:bg-bg-border transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={doSaveSnippet}
                  disabled={!snippetFolderId}
                  className="flex-1 h-7 text-[11px] rounded-md bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 transition-colors"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save-to-card modal */}
      <AnimatePresence>
        {saveMode === 'card' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-center justify-center z-20"
            onClick={() => setSaveMode(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-xl p-4 shadow-xl w-80 max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-xs font-semibold text-txt-primary mb-2.5">
                保存到卡片 · {cardCount} 张
              </div>

              {/* Deck picker */}
              <div className="mb-2">
                {decks.length > 0 && !createNewDeck && (
                  <select
                    value={deckId}
                    onChange={e => setDeckId(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded-md bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-violet/50"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                {createNewDeck && (
                  <input
                    value={newDeckName}
                    onChange={e => setNewDeckName(e.target.value)}
                    placeholder="新牌组名称"
                    className="w-full text-xs px-2 py-1.5 rounded-md bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-violet/50"
                  />
                )}
                <button
                  onClick={() => setCreateNewDeck(v => !v)}
                  className="text-[10px] text-txt-secondary hover:text-accent-violet transition-colors mt-1"
                >
                  {createNewDeck
                    ? (decks.length > 0 ? '← 选择已有牌组' : '')
                    : '+ 新建牌组'}
                </button>
              </div>

              {/* Preview */}
              <div className="flex-1 min-h-0 overflow-auto mb-3 border border-bg-border rounded-md p-2 bg-bg-elevated/40 space-y-1.5">
                {cardPreviews.map((c, i) => (
                  <div key={i} className="text-[10.5px]">
                    <div className="text-txt-primary font-medium truncate">
                      <span className="text-txt-muted mr-1">{i + 1}.</span>
                      {c.front}
                    </div>
                    {c.back && (
                      <div className="text-txt-secondary pl-4 truncate">→ {c.back}</div>
                    )}
                  </div>
                ))}
                {cardPreviews.length === 1 && !cardPreviews[0]?.back && (
                  <div className="text-[10px] text-txt-muted pt-1">
                    提示：使用 <span className="font-mono">---</span> 分隔正反面
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSaveMode(null)}
                  className="flex-1 h-7 text-[11px] rounded-md bg-bg-elevated text-txt-secondary hover:bg-bg-border transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={doSaveCards}
                  disabled={cardCount === 0 || (createNewDeck && !newDeckName.trim()) || (!createNewDeck && !deckId)}
                  className="flex-1 h-7 text-[11px] rounded-md bg-accent-violet/15 text-accent-violet hover:bg-accent-violet/25 disabled:opacity-40 transition-colors"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Scratch
