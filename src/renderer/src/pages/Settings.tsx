import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

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
