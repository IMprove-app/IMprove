import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

function SyncStatus(): JSX.Element {
  const [state, setState] = useState<'idle' | 'syncing' | 'error' | 'offline'>('idle')
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    // Get initial status
    window.api.getSyncStatus().then(s => {
      setState(s.state)
      setLastSync(s.lastSync)
    })

    // Listen for updates
    const unsub = window.api.onSyncStatus((status) => {
      setState(status.state as 'idle' | 'syncing' | 'error' | 'offline')
      setLastSync(status.lastSync)
    })

    return unsub
  }, [])

  const handleClick = () => {
    window.api.triggerSync()
  }

  const getLabel = () => {
    if (state === 'syncing') return '同步中'
    if (state === 'error') return '同步失败'
    if (!lastSync) return '未同步'
    const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000)
    if (ago < 1) return '刚刚同步'
    if (ago < 60) return `${ago}分钟前`
    return `${Math.floor(ago / 60)}小时前`
  }

  const dotColor = state === 'syncing'
    ? 'bg-accent-cyan'
    : state === 'error'
      ? 'bg-danger'
      : lastSync
        ? 'bg-success'
        : 'bg-txt-muted'

  return (
    <motion.button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-black/5 transition-colors"
      title="点击立即同步"
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
        animate={state === 'syncing' ? { opacity: [1, 0.3, 1] } : {}}
        transition={state === 'syncing' ? { repeat: Infinity, duration: 1 } : {}}
      />
      <span className="text-[10px] text-txt-muted">{getLabel()}</span>
    </motion.button>
  )
}

export default SyncStatus
