import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BADGES, BadgeMeta, levelTitle, xpForLevelUp } from '../data/badges'

interface UserProgress {
  level: number
  total_xp: number
  total_stars: number
  updated_at?: string
}

interface AchievementRow {
  code: string
  unlocked_at?: string | null
  progress?: number | null
}

function StarrySkyPage(): JSX.Element {
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [achievements, setAchievements] = useState<AchievementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [selectedBadge, setSelectedBadge] = useState<BadgeMeta | null>(null)

  const loadData = async () => {
    try {
      const [p, a] = await Promise.all([
        window.api.getProgress(),
        window.api.listAchievements()
      ])
      setProgress(p)
      setAchievements(a ?? [])
    } catch (e) {
      console.warn('load starry data failed', e)
      setProgress(null)
      setAchievements([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const unsubs: Array<() => void> = [
      window.api.onProgressUpdated(() => loadData()),
      window.api.onAchievementUnlocked(() => loadData())
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRecompute = async () => {
    setRecomputing(true)
    try {
      await window.api.recomputeAchievements()
      await loadData()
    } catch (e) {
      console.warn('recompute failed', e)
    } finally {
      setRecomputing(false)
    }
  }

  const unlockedMap = useMemo(() => {
    const m = new Map<string, AchievementRow>()
    for (const a of achievements) {
      if (a.unlocked_at) m.set(a.code, a)
    }
    return m
  }, [achievements])

  const unlockedCount = unlockedMap.size
  const totalBadges = BADGES.length

  const level = progress?.level ?? 1
  const totalXp = progress?.total_xp ?? 0
  const totalStars = progress?.total_stars ?? 0
  const isMaxLevel = level >= 20
  const xpNeeded = xpForLevelUp(level)
  // XP accumulated within current level — best-effort derivation
  const xpInLevel = isMaxLevel ? xpNeeded : Math.max(0, Math.min(xpNeeded, totalXp % xpNeeded))
  const xpPct = isMaxLevel ? 100 : Math.min(100, Math.round((xpInLevel / xpNeeded) * 100))

  if (loading) {
    return (
      <motion.div
        className="flex-1 flex items-center justify-center text-txt-muted text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        加载中...
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-6"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4">
        <h1 className="text-xl font-bold">星空</h1>
        <p className="text-[11px] text-txt-muted mt-0.5">打卡点亮属于你的星图</p>
      </div>

      {/* 等级卡片 */}
      <div className="glass-card p-4 mb-5">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold shadow-[0_0_16px_rgba(34,211,238,0.35)]"
            style={{
              background: 'linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)'
            }}
          >
            <span className="text-lg leading-none">Lv.{level}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-txt-primary">
                {levelTitle(level)}
              </span>
              {isMaxLevel && (
                <span className="text-[10px] text-txt-muted">已达 P1 上限</span>
              )}
            </div>
            <div className="mt-2 h-2 rounded-full bg-bg-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-cyan transition-all"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-txt-muted">
              <span>
                {isMaxLevel ? '—' : `${xpInLevel} / ${xpNeeded} XP`}
              </span>
              <span>
                总星光 {totalStars} · 累计 XP {totalXp}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 勋章墙 */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-[11px] uppercase tracking-wider text-txt-secondary font-semibold">
            勋章 · {unlockedCount} / {totalBadges}
          </h2>
        </div>

        {unlockedCount === 0 ? (
          <motion.div
            className="glass-card p-6 flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="w-14 h-14 rounded-full bg-bg-elevated border border-bg-border flex items-center justify-center mb-3 text-txt-muted">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <p className="text-sm text-txt-secondary mb-1">星空尚未点亮</p>
            <p className="text-[11px] text-txt-muted">打卡即是第一束光</p>
          </motion.div>
        ) : null}

        <div className={`grid grid-cols-3 gap-3 ${unlockedCount === 0 ? 'mt-3 opacity-90' : ''}`}>
          {BADGES.map((b, idx) => {
            const row = unlockedMap.get(b.code)
            const unlocked = !!row
            return (
              <motion.button
                key={b.code}
                type="button"
                onClick={() => setSelectedBadge(b)}
                className="group flex flex-col items-center gap-2 p-3 rounded-xl bg-bg-card border border-bg-border hover:border-accent-cyan/30 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * idx }}
                title={unlocked ? `${b.name} · 已解锁 ${row?.unlocked_at ? new Date(row.unlocked_at).toLocaleDateString() : ''}` : `${b.name} · ${b.description}`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                    unlocked
                      ? 'shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                      : 'bg-bg-elevated border-bg-border'
                  }`}
                  style={
                    unlocked
                      ? {
                          backgroundColor: b.color,
                          borderColor: 'rgba(34,211,238,0.6)'
                        }
                      : undefined
                  }
                >
                  {unlocked ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-txt-muted">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-[11px] font-medium truncate w-full text-center ${
                    unlocked ? 'text-txt-primary' : 'text-txt-muted'
                  }`}
                >
                  {b.name}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* 重算按钮 */}
      <div className="flex flex-col items-center mt-4">
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="text-xs py-1.5 px-3 rounded-lg bg-bg-elevated border border-bg-border text-txt-secondary hover:text-accent-cyan hover:border-accent-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {recomputing ? '重算中...' : '重算历史成就'}
        </button>
        <p className="text-[10px] text-txt-muted mt-2 text-center max-w-xs leading-relaxed">
          若你升级到新版本后发现部分旧数据的成就未解锁，可以重新扫描
        </p>
      </div>

      {/* 勋章详情弹窗 */}
      <AnimatePresence>
        {selectedBadge && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedBadge(null)}
          >
            <motion.div
              className="glass-card p-5 w-full max-w-sm"
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const row = unlockedMap.get(selectedBadge.code)
                const unlocked = !!row
                return (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                          unlocked
                            ? 'shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                            : 'bg-bg-elevated border-bg-border'
                        }`}
                        style={
                          unlocked
                            ? {
                                backgroundColor: selectedBadge.color,
                                borderColor: 'rgba(34,211,238,0.6)'
                              }
                            : undefined
                        }
                      >
                        {unlocked ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-txt-muted">
                            <rect x="4" y="11" width="16" height="10" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">{selectedBadge.name}</h3>
                        <p className="text-[11px] text-txt-muted">
                          {unlocked ? '已解锁' : '未解锁'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-txt-secondary mb-2">
                      <span className="text-txt-muted">解锁条件：</span>
                      {selectedBadge.description}
                    </p>
                    {unlocked ? (
                      <>
                        <p className="text-xs text-txt-primary italic mb-2">
                          “{selectedBadge.lore}”
                        </p>
                        {row?.unlocked_at && (
                          <p className="text-[10px] text-txt-muted">
                            于 {new Date(row.unlocked_at).toLocaleString()} 点亮
                          </p>
                        )}
                      </>
                    ) : null}
                    <button
                      onClick={() => setSelectedBadge(null)}
                      className="w-full mt-4 text-xs py-2 rounded-lg bg-bg-elevated text-txt-muted border border-bg-border"
                    >
                      关闭
                    </button>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default StarrySkyPage
