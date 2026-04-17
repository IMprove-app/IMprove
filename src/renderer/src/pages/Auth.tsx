import { useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  onSuccess: () => void
  onSkip: () => void
}

function Auth({ onSuccess, onSkip }: Props): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')

    const result = mode === 'login'
      ? await window.api.login(email.trim(), password)
      : await window.api.register(email.trim(), password)

    setLoading(false)

    if (result.ok) {
      if (mode === 'register') {
        setRegisterSuccess(true)
        setMode('login')
        return
      }
      onSuccess()
    } else {
      setError(result.error || '操作失败')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <motion.div
        className="w-full max-w-[320px]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            className="text-5xl mb-3"
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          >
            🚀
          </motion.div>
          <h1 className="text-2xl font-bold text-txt-primary">IMprove</h1>
          <p className="text-xs text-txt-muted mt-1">云端同步，多设备使用</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-bg-elevated rounded-lg p-0.5 mb-5">
          <button
            onClick={() => { setMode('login'); setError(''); setRegisterSuccess(false) }}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${
              mode === 'login'
                ? 'bg-accent-cyan/15 text-accent-cyan'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); setRegisterSuccess(false) }}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${
              mode === 'register'
                ? 'bg-accent-cyan/15 text-accent-cyan'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            注册
          </button>
        </div>

        {registerSuccess && (
          <motion.div
            className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20 text-xs text-success text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            注册成功！请查看邮箱确认后登录
          </motion.div>
        )}

        {/* Form */}
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="邮箱"
            className="w-full px-4 py-3 rounded-xl bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="密码"
            className="w-full px-4 py-3 rounded-xl bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors"
          />
        </div>

        {error && (
          <motion.p
            className="text-xs text-danger mt-3 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.p>
        )}

        <motion.button
          onClick={handleSubmit}
          disabled={loading || !email.trim() || !password.trim()}
          className="w-full mt-5 btn-glow text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </motion.button>

        <button
          onClick={onSkip}
          className="w-full mt-3 py-2.5 text-xs text-txt-muted hover:text-txt-secondary transition-colors"
        >
          离线使用（不同步）
        </button>
      </motion.div>
    </div>
  )
}

export default Auth
