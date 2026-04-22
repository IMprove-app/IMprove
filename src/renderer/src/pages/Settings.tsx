import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getReduceMotionPref, setReduceMotion } from '../lib/motionPrefs'
import HotkeyCapture from '../components/HotkeyCapture'

const DEFAULT_HUD_HOTKEY = 'CommandOrControl+Shift+E'
const DEFAULT_SCRATCH_HOTKEY = 'CommandOrControl+Shift+Q'

interface SnippetData {
  id: string
  folder_id?: string
  title: string
  content: string
  sort_order: number
  created_at: string
  updated_at?: string
}

interface SnippetFolderData {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at?: string
}

interface Props {
  onBack: () => void
  loggedIn: boolean
  onLogout: () => void
  onLogin: () => void
}

const TEMPLATES = [
  { name: '英语口语', icon: '🎤', iconKey: 'microphone', url: 'https://www.cambly.com', goal: 15 },
  { name: '英语听力', icon: '🎧', iconKey: 'headphones', url: 'https://www.bbc.co.uk/learningenglish', goal: 10 },
  { name: '刷算法题', icon: '💻', iconKey: 'code', url: 'https://leetcode.com/problemset/', goal: 20 },
  { name: '阅读', icon: '📖', iconKey: 'book-open', url: 'https://read.amazon.com', goal: 15 },
  { name: '冥想', icon: '🧠', iconKey: 'brain', url: 'https://www.youtube.com/results?search_query=guided+meditation', goal: 10 },
  { name: '健身', icon: '💪', iconKey: 'dumbbell', url: 'https://www.youtube.com/results?search_query=home+workout', goal: 20 },
  { name: '语言学习', icon: '🌍', iconKey: 'globe', url: 'https://www.duolingo.com/learn', goal: 10 }
]

function Settings({ onBack, loggedIn, onLogout, onLogin }: Props): JSX.Element {
  const [importing, setImporting] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  // null = 跟随系统; true = 强制减弱; false = 强制启用
  const [reduceMotionPref, setReduceMotionPref] = useState<boolean | null>(getReduceMotionPref())

  // Snippet HUD state
  const [hudHotkey, setHudHotkey] = useState<string>('')
  const [hudPinned, setHudPinned] = useState(false)
  // Scratch Pad state
  const [scratchHotkey, setScratchHotkey] = useState<string>('')
  const [scratchPinned, setScratchPinned] = useState(false)
  const [snippets, setSnippets] = useState<SnippetData[]>([])
  const [folders, setFolders] = useState<SnippetFolderData[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [addingSnippet, setAddingSnippet] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newFolderId, setNewFolderId] = useState<string>('')

  useEffect(() => {
    if (loggedIn) {
      window.api.getAuthStatus().then(s => {
        if (s.email) setEmail(s.email)
      })
      window.api.getSyncStatus().then(s => {
        setLastSync(s.lastSync)
      })
    }
  }, [loggedIn])

  // Load HUD hotkey + pinned + snippets + folders
  useEffect(() => {
    window.api.getHudHotkey().then(setHudHotkey).catch(() => {})
    window.api.getHudPinned().then(setHudPinned).catch(() => {})
    const loadSnippets = (): void => {
      window.api.listSnippets().then(list => setSnippets(list as SnippetData[])).catch(() => {})
    }
    const loadFolders = (): void => {
      window.api.listSnippetFolders().then(list => setFolders(list as SnippetFolderData[])).catch(() => {})
    }
    loadSnippets()
    loadFolders()
    const off = window.api.onSnippetsChanged(loadSnippets)
    const offFolders = window.api.onSnippetFoldersChanged(loadFolders)
    const offPin = window.api.onHudPinnedChanged(setHudPinned)
    window.api.getScratchHotkey().then(setScratchHotkey).catch(() => {})
    window.api.getScratchPinned().then(setScratchPinned).catch(() => {})
    const offScratchPin = window.api.onScratchPinnedChanged(setScratchPinned)
    return () => {
      off()
      offFolders()
      offPin()
      offScratchPin()
    }
  }, [])

  // Pick a sensible default folder for the add form whenever folders change.
  useEffect(() => {
    if (!newFolderId && folders.length > 0) {
      setNewFolderId(folders[0].id)
    }
    // If the selected folder was deleted, reset to the first available.
    if (newFolderId && !folders.some(f => f.id === newFolderId)) {
      setNewFolderId(folders[0]?.id || '')
    }
  }, [folders, newFolderId])

  const handleSetHotkey = async (accel: string): Promise<{ ok: boolean; error?: string; active?: string }> => {
    const result = await window.api.setHudHotkey(accel)
    if (result.ok) setHudHotkey(accel)
    return result
  }

  const handleTogglePinned = async (): Promise<void> => {
    const next = !hudPinned
    setHudPinned(next)
    await window.api.setHudPinned(next)
  }

  const handleAddSnippet = async (): Promise<void> => {
    const content = newContent.trim()
    if (!content) return
    // Must have a folder target — if none, auto-create a default folder first.
    let targetFolderId = newFolderId
    if (!targetFolderId) {
      const created = await window.api.createSnippetFolder({ name: '默认' })
      targetFolderId = created.id
      setNewFolderId(created.id)
    }
    await window.api.createSnippet({
      folder_id: targetFolderId,
      title: newTitle.trim(),
      content
    })
    setNewTitle('')
    setNewContent('')
    setAddingSnippet(false)
  }

  const handleBeginEdit = (sn: SnippetData): void => {
    setEditingId(sn.id)
    setEditTitle(sn.title)
    setEditContent(sn.content)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingId) return
    await window.api.updateSnippet(editingId, {
      title: editTitle.trim(),
      content: editContent.trim()
    })
    setEditingId(null)
  }

  const handleDeleteSnippet = async (id: string): Promise<void> => {
    await window.api.deleteSnippet(id)
    if (editingId === id) setEditingId(null)
  }

  const handleOpenHud = async (): Promise<void> => {
    await window.api.toggleHud()
  }

  const handleOpenScratch = async (): Promise<void> => {
    await window.api.toggleScratch()
  }

  const handleSetScratchHotkey = async (accel: string): Promise<{ ok: boolean; error?: string; active?: string }> => {
    const result = await window.api.setScratchHotkey(accel)
    if (result.ok) setScratchHotkey(accel)
    return result
  }

  const handleToggleScratchPinned = async (): Promise<void> => {
    const next = !scratchPinned
    setScratchPinned(next)
    await window.api.setScratchPinned(next)
  }

  const updateReduceMotion = (value: boolean | null): void => {
    setReduceMotion(value)
    setReduceMotionPref(value)
  }

  const handleImportTemplate = async (t: typeof TEMPLATES[0]) => {
    setImporting(true)
    await window.api.createHabit({
      name: t.name,
      icon: t.iconKey,
      target_url: t.url,
      daily_goal_m: t.goal,
      sort_order: 0
    })
    setImporting(false)
  }

  const handleSyncNow = async () => {
    await window.api.triggerSync()
    const s = await window.api.getSyncStatus()
    setLastSync(s.lastSync)
  }

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-5"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg bg-bg-elevated border border-bg-border flex items-center justify-center text-txt-secondary hover:text-txt-primary transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">设置</h1>
      </div>

      {/* Account section */}
      <div className="glass-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-txt-secondary mb-3">账户与同步</h3>
        {loggedIn ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-txt-primary font-medium">{email}</p>
                <p className="text-[10px] text-txt-muted mt-0.5">
                  {lastSync
                    ? `上次同步: ${new Date(lastSync).toLocaleString('zh-CN')}`
                    : '尚未同步'}
                </p>
              </div>
              <div className="w-2 h-2 rounded-full bg-success" />
            </div>
            <div className="flex gap-2">
              <motion.button
                onClick={handleSyncNow}
                className="flex-1 text-[10px] py-2 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors"
                whileTap={{ scale: 0.95 }}
              >
                立即同步
              </motion.button>
              <motion.button
                onClick={onLogout}
                className="flex-1 text-[10px] py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-colors"
                whileTap={{ scale: 0.95 }}
              >
                退出登录
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-txt-muted mb-3">登录后可在多设备间同步数据</p>
            <motion.button
              onClick={onLogin}
              className="btn-glow text-xs py-2 px-6"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              登录 / 注册
            </motion.button>
          </div>
        )}
      </div>

      <div className="glass-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-txt-secondary mb-3">快速添加习惯模板</h3>
        <div className="space-y-2">
          {TEMPLATES.map((t, idx) => (
            <motion.div
              key={t.name}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg-elevated/50"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <div className="flex items-center gap-2">
                <span>{t.icon}</span>
                <div>
                  <p className="text-xs font-medium text-txt-primary">{t.name}</p>
                  <p className="text-[10px] text-txt-muted">{t.goal}分钟/天</p>
                </div>
              </div>
              <motion.button
                onClick={() => handleImportTemplate(t)}
                disabled={importing}
                className="text-[10px] px-3 py-1 rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors disabled:opacity-40"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                + 添加
              </motion.button>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="glass-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-txt-secondary mb-3">外观与动画</h3>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-txt-primary font-medium">减弱动画</p>
            <p className="text-[10px] text-txt-muted mt-0.5">关闭粒子爆发、闪光等动效，减少视觉负担</p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          {([
            { value: null, label: '跟随系统' },
            { value: false, label: '始终启用' },
            { value: true, label: '始终减弱' }
          ] as { value: boolean | null; label: string }[]).map(opt => {
            const active = reduceMotionPref === opt.value
            return (
              <motion.button
                key={String(opt.value)}
                onClick={() => updateReduceMotion(opt.value)}
                className={`flex-1 text-[10px] py-2 rounded-lg border transition-colors ${
                  active
                    ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30'
                    : 'bg-bg-elevated text-txt-muted border-bg-border hover:border-txt-muted/30'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {opt.label}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Snippet HUD (速贴) */}
      <div className="glass-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-txt-secondary">速贴 · 剪贴片段</h3>
          <motion.button
            onClick={handleOpenHud}
            className="text-[10px] px-2 py-1 rounded-md bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            打开 HUD
          </motion.button>
        </div>

        {/* Hotkey */}
        <div className="mb-3">
          <p className="text-[11px] text-txt-primary font-medium mb-1.5">唤醒快捷键</p>
          <HotkeyCapture
            value={hudHotkey}
            onChange={handleSetHotkey}
            defaultAccel={DEFAULT_HUD_HOTKEY}
          />
        </div>

        {/* Pin default */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-txt-primary font-medium">默认置顶在最前方</p>
            <p className="text-[10px] text-txt-muted mt-0.5">复制后不自动收起，适合连续查找多条内容</p>
          </div>
          <button
            onClick={handleTogglePinned}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              hudPinned ? 'bg-accent-cyan' : 'bg-bg-border'
            }`}
          >
            <span
              className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
              style={{ transform: hudPinned ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        {/* Snippet list */}
        <div className="pt-2 border-t border-bg-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-txt-secondary font-medium">管理片段 ({snippets.length})</p>
            {!addingSnippet && (
              <button
                onClick={() => setAddingSnippet(true)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors"
              >
                + 新建
              </button>
            )}
          </div>

          <AnimatePresence>
            {addingSnippet && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-2.5 mb-2 rounded-lg bg-bg-elevated border border-accent-cyan/20 space-y-2">
                  {folders.length > 0 && (
                    <select
                      value={newFolderId}
                      onChange={e => setNewFolderId(e.target.value)}
                      className="w-full text-xs px-2 py-1 rounded bg-bg-card border border-bg-border focus:outline-none focus:border-accent-cyan/50"
                    >
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name || '未命名文件夹'}</option>
                      ))}
                    </select>
                  )}
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="标题 (可选)"
                    className="w-full text-xs px-2 py-1 rounded bg-bg-card border border-bg-border focus:outline-none focus:border-accent-cyan/50"
                  />
                  <textarea
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    placeholder="粘贴内容..."
                    rows={3}
                    className="w-full text-xs px-2 py-1 rounded bg-bg-card border border-bg-border focus:outline-none focus:border-accent-cyan/50 resize-none font-mono"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setAddingSnippet(false); setNewTitle(''); setNewContent('') }}
                      className="text-[10px] px-3 py-1 rounded-md text-txt-secondary hover:bg-bg-border transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAddSnippet}
                      disabled={!newContent.trim()}
                      className="text-[10px] px-3 py-1 rounded-md bg-accent-cyan text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {snippets.length === 0 && !addingSnippet ? (
            <p className="text-[10px] text-txt-muted text-center py-3">
              还没有片段，可在 HUD 中创建文件夹与片段
            </p>
          ) : (
            <div className="space-y-3">
              {folders.map(folder => {
                const folderSnippets = snippets.filter(sn => sn.folder_id === folder.id)
                if (folderSnippets.length === 0) return null
                return (
                  <div key={folder.id} className="space-y-1.5">
                    <p className="text-[10px] text-txt-muted font-medium px-1 flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      {folder.name || '未命名文件夹'}
                      <span className="text-txt-muted/70">· {folderSnippets.length}</span>
                    </p>
                    {folderSnippets.map(sn => {
                      const isEditing = editingId === sn.id
                      return (
                        <div
                          key={sn.id}
                          className="rounded-lg bg-bg-elevated/60 border border-bg-border p-2"
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                placeholder="标题 (可选)"
                                className="w-full text-xs px-2 py-1 rounded bg-bg-card border border-bg-border focus:outline-none focus:border-accent-cyan/50"
                              />
                              <textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                rows={3}
                                className="w-full text-xs px-2 py-1 rounded bg-bg-card border border-bg-border focus:outline-none focus:border-accent-cyan/50 resize-none font-mono"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => handleDeleteSnippet(sn.id)}
                                  className="text-[10px] px-3 py-1 rounded-md text-danger hover:bg-danger/10 transition-colors mr-auto"
                                >
                                  删除
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="text-[10px] px-3 py-1 rounded-md text-txt-secondary hover:bg-bg-border transition-colors"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={handleSaveEdit}
                                  className="text-[10px] px-3 py-1 rounded-md bg-accent-cyan text-white hover:opacity-90 transition-opacity"
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {sn.title && (
                                  <p className="text-[11px] font-semibold text-txt-primary truncate">
                                    {sn.title}
                                  </p>
                                )}
                                <p
                                  className={`text-[10px] text-txt-secondary font-mono truncate ${
                                    sn.title ? 'mt-0.5' : ''
                                  }`}
                                >
                                  {sn.content.split('\n')[0] || '(空)'}
                                </p>
                              </div>
                              <button
                                onClick={() => handleBeginEdit(sn)}
                                className="text-[10px] px-2 py-0.5 rounded-md text-txt-secondary hover:bg-bg-border transition-colors flex-shrink-0"
                              >
                                编辑
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {/* Orphan snippets (folder_id missing or pointing at a deleted folder) */}
              {(() => {
                const orphans = snippets.filter(
                  sn => !sn.folder_id || !folders.some(f => f.id === sn.folder_id)
                )
                if (orphans.length === 0) return null
                return (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-txt-muted font-medium px-1">未分组 · {orphans.length}</p>
                    {orphans.map(sn => (
                      <div
                        key={sn.id}
                        className="rounded-lg bg-bg-elevated/60 border border-bg-border p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {sn.title && (
                              <p className="text-[11px] font-semibold text-txt-primary truncate">
                                {sn.title}
                              </p>
                            )}
                            <p className="text-[10px] text-txt-secondary font-mono truncate mt-0.5">
                              {sn.content.split('\n')[0] || '(空)'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteSnippet(sn.id)}
                            className="text-[10px] px-2 py-0.5 rounded-md text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Scratch Pad (草稿纸) */}
      <div className="glass-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-txt-secondary">草稿纸 · 临时粘贴</h3>
          <motion.button
            onClick={handleOpenScratch}
            className="text-[10px] px-2 py-1 rounded-md bg-accent-violet/10 text-accent-violet border border-accent-violet/20 hover:bg-accent-violet/20 transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            打开草稿纸
          </motion.button>
        </div>

        <p className="text-[10px] text-txt-muted mb-3 leading-relaxed">
          快捷键唤出浮动草稿纸，可临时粘贴，再选择保存到速贴或卡片。保存到卡片时用 <span className="font-mono text-txt-secondary">---</span> 单独一行分隔正反面，可一次创建多张。
        </p>

        {/* Hotkey */}
        <div className="mb-3">
          <p className="text-[11px] text-txt-primary font-medium mb-1.5">唤醒快捷键</p>
          <HotkeyCapture
            value={scratchHotkey}
            onChange={handleSetScratchHotkey}
            defaultAccel={DEFAULT_SCRATCH_HOTKEY}
          />
        </div>

        {/* Pin default */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-txt-primary font-medium">默认置顶在最前方</p>
            <p className="text-[10px] text-txt-muted mt-0.5">保存后不自动收起，适合连续整理内容</p>
          </div>
          <button
            onClick={handleToggleScratchPinned}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              scratchPinned ? 'bg-accent-violet' : 'bg-bg-border'
            }`}
          >
            <span
              className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
              style={{ transform: scratchPinned ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>
      </div>

      <div className="glass-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-txt-secondary mb-2">关于</h3>
        <div className="space-y-2 text-xs text-txt-muted">
          <p><span className="text-txt-secondary">IMprove</span> v1.0.0</p>
          <p>每日打卡软件，培养好习惯，成为更好的自己</p>
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-txt-secondary mb-2">数据存储</h3>
        <p className="text-xs text-txt-muted">
          {loggedIn
            ? '数据存储在本地并同步到云端，可在多设备间访问。'
            : '所有数据存储在本地，不会上传到任何服务器。'}
        </p>
        <p className="text-[10px] text-txt-muted mt-1 font-mono">
          %APPDATA%/improve/data/store.json
        </p>
      </div>
    </motion.div>
  )
}

export default Settings
