import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'

interface SnippetFolderData {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at?: string
}

interface SnippetData {
  id: string
  folder_id?: string
  title: string
  content: string
  sort_order: number
  created_at: string
  updated_at?: string
}

function firstLine(content: string): string {
  const trimmed = (content || '').trim()
  const nl = trimmed.indexOf('\n')
  return nl === -1 ? trimmed : trimmed.slice(0, nl)
}

const SWIPE_REVEAL_PX = 64
const SWIPE_OPEN_THRESHOLD = 28
const SWIPE_CLOSE_THRESHOLD = 28

type PendingDelete =
  | { kind: 'snippet'; id: string }
  | { kind: 'folder'; id: string; count: number }

function Hud(): JSX.Element {
  // Data
  const [folders, setFolders] = useState<SnippetFolderData[]>([])
  const [allSnippets, setAllSnippets] = useState<SnippetData[]>([])

  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // UI
  const [search, setSearch] = useState('')
  const [pinned, setPinned] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Add form (context-aware: folder vs snippet)
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newFolderName, setNewFolderName] = useState('')

  // Folder rename inline state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  // Detail modal
  const [detailId, setDetailId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [detailConfirmDelete, setDetailConfirmDelete] = useState(false)

  // Swipe reveal
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originalRef = useRef<{ title: string; content: string }>({ title: '', content: '' })
  const justDraggedRef = useRef(false)
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentFolder = useMemo(
    () => folders.find(f => f.id === currentFolderId) || null,
    [folders, currentFolderId]
  )
  const detailSnippet = useMemo(
    () => (detailId ? allSnippets.find(sn => sn.id === detailId) || null : null),
    [allSnippets, detailId]
  )
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const sn of allSnippets) {
      if (sn.folder_id) counts[sn.folder_id] = (counts[sn.folder_id] || 0) + 1
    }
    return counts
  }, [allSnippets])
  const snippetsInFolder = useMemo(
    () => (currentFolderId ? allSnippets.filter(sn => sn.folder_id === currentFolderId) : []),
    [allSnippets, currentFolderId]
  )

  // Transparent body inside HUD window only.
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => {
      document.body.style.background = prev
    }
  }, [])

  const loadAll = async (): Promise<void> => {
    try {
      const [f, s] = await Promise.all([
        window.api.listSnippetFolders(),
        window.api.listSnippets()
      ])
      setFolders(f as SnippetFolderData[])
      setAllSnippets(s as SnippetData[])
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    loadAll()
    const off1 = window.api.onSnippetFoldersChanged(loadAll)
    const off2 = window.api.onSnippetsChanged(loadAll)
    return () => {
      off1()
      off2()
    }
  }, [])

  useEffect(() => {
    window.api.getHudPinned().then(setPinned).catch(() => {})
    const off = window.api.onHudPinnedChanged(setPinned)
    return off
  }, [])

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  // Re-focus search whenever navigation level changes.
  useEffect(() => {
    setSearch('')
    setOpenSwipeId(null)
    setShowAdd(false)
    setTimeout(() => searchRef.current?.focus(), 30)
  }, [currentFolderId])

  const flushDraft = async (): Promise<void> => {
    if (!detailId) return
    const original = originalRef.current
    const nextTitle = draftTitle.trim()
    const nextContent = draftContent.trim()
    if (nextTitle === original.title.trim() && nextContent === original.content.trim()) return
    if (!nextContent) return
    await window.api.updateSnippet(detailId, { title: nextTitle, content: nextContent })
  }

  const closeDetail = async (): Promise<void> => {
    if (detailConfirmDelete) {
      setDetailConfirmDelete(false)
      return
    }
    await flushDraft()
    setDetailId(null)
  }

  // Esc hierarchy: pendingDelete > detailConfirm > renaming > addForm > detail > openSwipe > backToFolders > hideHud
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (pendingDelete) {
        e.preventDefault()
        setPendingDelete(null)
        return
      }
      if (detailConfirmDelete) {
        e.preventDefault()
        setDetailConfirmDelete(false)
        return
      }
      if (renamingFolderId) {
        e.preventDefault()
        setRenamingFolderId(null)
        return
      }
      if (showAdd) {
        e.preventDefault()
        setShowAdd(false)
        return
      }
      if (detailId) {
        e.preventDefault()
        closeDetail()
        return
      }
      if (openSwipeId) {
        e.preventDefault()
        setOpenSwipeId(null)
        return
      }
      if (currentFolderId) {
        e.preventDefault()
        setCurrentFolderId(null)
        return
      }
      window.api.hideHud()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detailId,
    showAdd,
    detailConfirmDelete,
    pendingDelete,
    openSwipeId,
    renamingFolderId,
    currentFolderId,
    draftTitle,
    draftContent
  ])

  // Filtering per view
  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return folders
    return folders.filter(f => f.name.toLowerCase().includes(q))
  }, [folders, search])

  const filteredSnippets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return snippetsInFolder
    return snippetsInFolder.filter(
      sn => sn.title.toLowerCase().includes(q) || sn.content.toLowerCase().includes(q)
    )
  }, [snippetsInFolder, search])

  // ===== Snippet tile handlers =====

  const handleSnippetClick = (sn: SnippetData): void => {
    if (justDraggedRef.current) return
    if (openSwipeId !== null) {
      setOpenSwipeId(null)
      return
    }
    setDetailId(sn.id)
    setDraftTitle(sn.title)
    setDraftContent(sn.content)
    originalRef.current = { title: sn.title, content: sn.content }
    setDetailConfirmDelete(false)
  }

  // ===== Folder tile handlers =====

  const handleFolderClick = (f: SnippetFolderData): void => {
    if (justDraggedRef.current) return
    if (renamingFolderId === f.id) return
    if (openSwipeId !== null) {
      setOpenSwipeId(null)
      return
    }
    setCurrentFolderId(f.id)
  }

  const handleBeginRename = (f: SnippetFolderData): void => {
    setRenamingFolderId(f.id)
    setRenameDraft(f.name)
  }

  const handleCommitRename = async (): Promise<void> => {
    if (!renamingFolderId) return
    const name = renameDraft.trim()
    if (name) {
      await window.api.updateSnippetFolder(renamingFolderId, { name })
    }
    setRenamingFolderId(null)
  }

  // ===== Shared drag tracking =====

  const handleTileDragStart = (): void => {
    justDraggedRef.current = true
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current)
  }

  const handleTileDragEnd = (tileId: string, info: PanInfo): void => {
    const isOpen = openSwipeId === tileId
    if (!isOpen && info.offset.x < -SWIPE_OPEN_THRESHOLD) {
      setOpenSwipeId(tileId)
    } else if (isOpen && info.offset.x > SWIPE_CLOSE_THRESHOLD) {
      setOpenSwipeId(null)
    }
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current)
    dragResetTimerRef.current = setTimeout(() => {
      justDraggedRef.current = false
    }, 150)
  }

  // ===== Swipe delete =====

  const handleSnippetDeleteTap = (snId: string): void => {
    setPendingDelete({ kind: 'snippet', id: snId })
  }

  const handleFolderDeleteTap = (folderId: string): void => {
    setPendingDelete({
      kind: 'folder',
      id: folderId,
      count: folderCounts[folderId] || 0
    })
  }

  const handleCancelPendingDelete = (): void => {
    setPendingDelete(null)
    setOpenSwipeId(null)
  }

  const handleConfirmPendingDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'snippet') {
      await window.api.deleteSnippet(pendingDelete.id)
    } else {
      await window.api.deleteSnippetFolder(pendingDelete.id)
    }
    setPendingDelete(null)
    setOpenSwipeId(null)
  }

  // ===== Detail actions =====

  const handleCopyFromDetail = async (): Promise<void> => {
    if (!detailSnippet) return
    await flushDraft()
    await window.api.copySnippet(detailSnippet.id)
    try {
      await navigator.clipboard.writeText(draftContent.trim())
    } catch {
      /* non-fatal */
    }
    setCopiedId(detailSnippet.id)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 900)
    if (!pinned) {
      setTimeout(() => {
        setDetailId(null)
        window.api.hideHud()
      }, 260)
    }
  }

  const handleDetailDelete = (): void => {
    if (!detailSnippet) return
    setDetailConfirmDelete(true)
  }

  const handleDetailConfirmDelete = async (): Promise<void> => {
    if (!detailSnippet) return
    await window.api.deleteSnippet(detailSnippet.id)
    setDetailConfirmDelete(false)
    setDetailId(null)
  }

  // ===== Header actions =====

  const handleTogglePin = async (): Promise<void> => {
    await window.api.setHudPinned(!pinned)
  }

  const handleAddSubmit = async (): Promise<void> => {
    if (currentFolderId) {
      const content = newContent.trim()
      if (!content) return
      await window.api.createSnippet({
        folder_id: currentFolderId,
        title: newTitle.trim(),
        content
      })
      setNewTitle('')
      setNewContent('')
    } else {
      const name = newFolderName.trim()
      if (!name) return
      await window.api.createSnippetFolder({ name })
      setNewFolderName('')
    }
    setShowAdd(false)
  }

  const handleBack = (): void => {
    setCurrentFolderId(null)
  }

  const inFolderView = currentFolderId !== null

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
          {inFolderView && (
            <button
              onClick={handleBack}
              title="返回"
              className="w-6 h-6 rounded-md flex items-center justify-center text-txt-secondary hover:bg-bg-elevated transition-colors flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <span className="text-[11px] font-semibold text-txt-secondary select-none truncate">
            {inFolderView ? currentFolder?.name || '文件夹' : '速贴'}
          </span>
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
            onClick={() => setShowAdd(v => !v)}
            title={inFolderView ? '添加片段' : '添加文件夹'}
            className="w-7 h-7 rounded-md flex items-center justify-center text-txt-secondary hover:bg-bg-elevated transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={() => window.api.hideHud()}
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

      {/* Search */}
      <div className="px-3 py-2" style={{ flexShrink: 0 }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={inFolderView ? '搜索片段...' : '搜索文件夹...'}
          className="w-full text-xs px-3 py-1.5 rounded-lg bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 text-txt-primary placeholder:text-txt-muted"
        />
      </div>

      {/* Add form (context-aware) */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 overflow-hidden"
            style={{ flexShrink: 0 }}
          >
            <div className="glass-card p-2.5 mb-2 space-y-2">
              {inFolderView ? (
                <>
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="标题 (可选)"
                    className="w-full text-xs px-2 py-1 rounded bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50"
                  />
                  <textarea
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    placeholder="粘贴内容..."
                    rows={3}
                    className="w-full text-xs px-2 py-1 rounded bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 resize-none font-mono"
                  />
                </>
              ) : (
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="文件夹名称"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSubmit() }}
                  className="w-full text-xs px-2 py-1 rounded bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50"
                />
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowAdd(false)
                    setNewTitle('')
                    setNewContent('')
                    setNewFolderName('')
                  }}
                  className="text-[11px] px-3 py-1 rounded-md text-txt-secondary hover:bg-bg-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddSubmit}
                  disabled={inFolderView ? !newContent.trim() : !newFolderName.trim()}
                  className="text-[11px] px-3 py-1 rounded-md bg-accent-cyan text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List — folders or snippets */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {inFolderView ? (
          // Snippet list within folder
          filteredSnippets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-txt-muted text-xs text-center py-12 px-6">
              <p className="mb-1">{snippetsInFolder.length === 0 ? '这个文件夹还是空的' : '无匹配的片段'}</p>
              <p className="text-[10px]">
                {snippetsInFolder.length === 0 ? '点击右上 + 开始添加' : '换个关键词试试'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredSnippets.map(sn => {
                const preview = firstLine(sn.content)
                const isCopied = copiedId === sn.id
                const isSwipeOpen = openSwipeId === sn.id
                return (
                  <div
                    key={sn.id}
                    className="relative overflow-hidden rounded-xl"
                    style={{ touchAction: 'pan-y' }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); handleSnippetDeleteTap(sn.id) }}
                      className="absolute flex items-center justify-center bg-danger text-white text-[11px] font-semibold"
                      style={{
                        width: SWIPE_REVEAL_PX - 6,
                        right: 3,
                        top: 3,
                        bottom: 3,
                        borderRadius: 9
                      }}
                      tabIndex={isSwipeOpen ? 0 : -1}
                      aria-hidden={!isSwipeOpen}
                    >
                      删除
                    </button>
                    <motion.div
                      layout
                      drag="x"
                      dragConstraints={{ left: -SWIPE_REVEAL_PX, right: 0 }}
                      dragElastic={0.12}
                      dragMomentum={false}
                      animate={{ x: isSwipeOpen ? -SWIPE_REVEAL_PX : 0 }}
                      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                      onDragStart={handleTileDragStart}
                      onDragEnd={(_, info) => handleTileDragEnd(sn.id, info)}
                      className="glass-card p-2.5 relative cursor-pointer"
                      onClick={() => handleSnippetClick(sn)}
                      whileTap={isSwipeOpen ? {} : { scale: 0.98 }}
                    >
                      <div className="min-w-0">
                        {sn.title && (
                          <p className="text-[11px] font-semibold text-txt-primary truncate">{sn.title}</p>
                        )}
                        <p className={`text-[11px] text-txt-secondary truncate font-mono ${sn.title ? 'mt-0.5' : ''}`}>
                          {preview || '(空)'}
                        </p>
                      </div>
                      <AnimatePresence>
                        {isCopied && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute inset-0 flex items-center justify-center bg-accent-cyan/92 text-white text-[11px] font-semibold rounded-xl"
                          >
                            已复制
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          // Folder list (root view)
          filteredFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-txt-muted text-xs text-center py-12 px-6">
              <p className="mb-1">{folders.length === 0 ? '还没有文件夹' : '无匹配的文件夹'}</p>
              <p className="text-[10px]">
                {folders.length === 0 ? '点击右上 + 新建一个文件夹' : '换个关键词试试'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredFolders.map(f => {
                const isSwipeOpen = openSwipeId === f.id
                const isRenaming = renamingFolderId === f.id
                const count = folderCounts[f.id] || 0
                return (
                  <div
                    key={f.id}
                    className="relative overflow-hidden rounded-xl"
                    style={{ touchAction: 'pan-y' }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); handleFolderDeleteTap(f.id) }}
                      className="absolute flex items-center justify-center bg-danger text-white text-[11px] font-semibold"
                      style={{
                        width: SWIPE_REVEAL_PX - 6,
                        right: 3,
                        top: 3,
                        bottom: 3,
                        borderRadius: 9
                      }}
                      tabIndex={isSwipeOpen ? 0 : -1}
                      aria-hidden={!isSwipeOpen}
                    >
                      删除
                    </button>
                    <motion.div
                      layout
                      drag={isRenaming ? false : 'x'}
                      dragConstraints={{ left: -SWIPE_REVEAL_PX, right: 0 }}
                      dragElastic={0.12}
                      dragMomentum={false}
                      animate={{ x: isSwipeOpen ? -SWIPE_REVEAL_PX : 0 }}
                      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                      onDragStart={handleTileDragStart}
                      onDragEnd={(_, info) => handleTileDragEnd(f.id, info)}
                      className="glass-card p-2.5 relative cursor-pointer group flex items-center gap-2"
                      onClick={() => handleFolderClick(f)}
                      whileTap={isSwipeOpen || isRenaming ? {} : { scale: 0.98 }}
                    >
                      {/* Folder icon */}
                      <div className="w-7 h-7 rounded-md bg-accent-cyan/10 text-accent-cyan flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={e => setRenameDraft(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onBlur={handleCommitRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCommitRename()
                              if (e.key === 'Escape') setRenamingFolderId(null)
                            }}
                            className="w-full text-[12px] font-semibold px-2 py-0.5 rounded bg-bg-elevated border border-accent-cyan/50 focus:outline-none"
                          />
                        ) : (
                          <>
                            <p className="text-[12px] font-semibold text-txt-primary truncate">
                              {f.name || '未命名文件夹'}
                            </p>
                            <p className="text-[10px] text-txt-muted mt-0.5">{count} 条</p>
                          </>
                        )}
                      </div>
                      {!isRenaming && (
                        <button
                          onClick={e => { e.stopPropagation(); handleBeginRename(f) }}
                          title="重命名"
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-txt-secondary hover:bg-bg-elevated transition-all flex-shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}
                    </motion.div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Centered detail modal */}
      <AnimatePresence>
        {detailSnippet && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-3">
            <motion.div
              key="detail-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0"
              style={{ background: 'rgba(0, 0, 0, 0.28)' }}
              onClick={closeDetail}
            />

            <motion.div
              key="detail-panel"
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative z-10 flex flex-col overflow-hidden"
              style={{
                width: '88%',
                height: '76%',
                background: 'rgba(255, 255, 255, 0.99)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: 16,
                boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
                border: '1px solid rgba(0, 0, 0, 0.06)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 pt-2 pb-1.5 flex-shrink-0">
                <span className="text-[10px] text-txt-muted select-none px-1">
                  Esc 关闭 · 自动保存
                </span>
                <button
                  onClick={closeDetail}
                  title="关闭"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-txt-secondary hover:bg-bg-elevated transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="px-3 pb-2 flex-shrink-0">
                <input
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  placeholder="标题 (可选)"
                  className="w-full text-sm font-semibold px-2 py-1.5 rounded-lg bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 text-txt-primary"
                />
              </div>

              <div className="flex-1 px-3 pb-2 overflow-hidden">
                <textarea
                  value={draftContent}
                  onChange={e => setDraftContent(e.target.value)}
                  className="w-full h-full text-xs px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border focus:outline-none focus:border-accent-cyan/50 resize-none font-mono text-txt-primary"
                  placeholder="内容"
                />
              </div>

              <div className="px-3 py-3 border-t border-bg-border flex-shrink-0">
                <AnimatePresence mode="wait">
                  {detailConfirmDelete ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-[11px] text-txt-primary font-medium flex-1">
                        确认删除该片段？
                      </span>
                      <button
                        onClick={() => setDetailConfirmDelete(false)}
                        className="text-[11px] px-3 py-1.5 rounded-md text-txt-secondary bg-bg-elevated hover:bg-bg-border transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleDetailConfirmDelete}
                        className="text-[11px] px-4 py-1.5 rounded-md bg-danger text-white hover:opacity-90 transition-opacity font-semibold"
                      >
                        删除
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="actions"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <button
                        onClick={handleDetailDelete}
                        className="text-[11px] px-3 py-1.5 rounded-md text-danger bg-danger/10 hover:bg-danger/20 transition-colors font-medium"
                      >
                        删除
                      </button>
                      <div className="flex-1" />
                      <motion.button
                        onClick={handleCopyFromDetail}
                        whileTap={{ scale: 0.96 }}
                        className="text-xs px-6 py-1.5 rounded-md bg-accent-cyan text-white hover:opacity-90 transition-opacity font-semibold shadow-sm"
                      >
                        {copiedId === detailSnippet.id ? '已复制 ✓' : '复制'}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unified delete-confirm modal (swipe-delete trigger for both folder and snippet) */}
      <AnimatePresence>
        {pendingDelete && (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
            <motion.div
              key="del-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
              style={{ background: 'rgba(0, 0, 0, 0.38)' }}
              onClick={handleCancelPendingDelete}
            />
            <motion.div
              key="del-dialog"
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 6 }}
              transition={{ type: 'spring', damping: 26, stiffness: 340 }}
              className="relative z-10 flex flex-col px-4 py-4 w-full max-w-xs"
              style={{
                background: 'rgba(255, 255, 255, 0.99)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: 14,
                boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
                border: '1px solid rgba(0, 0, 0, 0.06)'
              }}
              onClick={e => e.stopPropagation()}
            >
              {pendingDelete.kind === 'folder' ? (
                <>
                  <p className="text-sm font-semibold text-txt-primary mb-1">确认删除文件夹？</p>
                  <p className="text-[11px] text-txt-secondary mb-4">
                    {(() => {
                      const f = folders.find(x => x.id === pendingDelete.id)
                      const name = f?.name || '未命名文件夹'
                      return pendingDelete.count > 0
                        ? `"${name}" · 内部 ${pendingDelete.count} 条片段也会一并删除`
                        : `"${name}"`
                    })()}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-txt-primary mb-1">确认删除该片段？</p>
                  <p className="text-[11px] text-txt-secondary font-mono truncate mb-4">
                    {(() => {
                      const sn = allSnippets.find(x => x.id === pendingDelete.id)
                      return sn ? (sn.title || firstLine(sn.content) || '(空)') : ''
                    })()}
                  </p>
                </>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelPendingDelete}
                  className="text-[11px] px-4 py-1.5 rounded-md text-txt-secondary bg-bg-elevated hover:bg-bg-border transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmPendingDelete}
                  className="text-[11px] px-4 py-1.5 rounded-md bg-danger text-white hover:opacity-90 transition-opacity font-semibold"
                >
                  删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Hud
