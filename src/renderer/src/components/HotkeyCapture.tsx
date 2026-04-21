import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (accel: string) => Promise<{ ok: boolean; error?: string; active?: string }>
  defaultAccel?: string
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'Super', 'OS'])

function keyToElectronToken(e: KeyboardEvent): string | null {
  const k = e.key
  // Letters: normalize to uppercase
  if (/^[a-zA-Z]$/.test(k)) return k.toUpperCase()
  // Digits
  if (/^[0-9]$/.test(k)) return k
  // Function keys
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k
  // Named keys that Electron accepts directly
  const map: Record<string, string> = {
    ' ': 'Space',
    Enter: 'Return',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    '-': '-',
    '=': '=',
    '[': '[',
    ']': ']',
    '\\': '\\',
    ';': ';',
    "'": "'",
    ',': ',',
    '.': '.',
    '/': '/',
    '`': '`'
  }
  if (map[k]) return map[k]
  return null
}

function buildAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('CommandOrControl')
  else if (e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const token = keyToElectronToken(e)
  if (!token) return null
  parts.push(token)
  // Require at least one modifier to avoid capturing plain letters.
  if (parts.length < 2) return null
  return parts.join('+')
}

function HotkeyCapture({ value, onChange, defaultAccel }: Props): JSX.Element {
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!capturing) return
    const handler = (e: KeyboardEvent): void => {
      // Allow Esc to cancel.
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setCapturing(false)
        setPreview(null)
        return
      }
      // Ignore modifier-only key presses — wait for the final key.
      if (MODIFIER_KEYS.has(e.key)) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      const accel = buildAccelerator(e)
      if (!accel) {
        setError('需要至少一个修饰键（Ctrl / Alt / Shift）')
        return
      }
      setPreview(accel)
      // Commit
      setBusy(true)
      setError(null)
      onChange(accel)
        .then(result => {
          if (!result.ok) {
            setError(result.error || '注册失败')
          } else {
            setCapturing(false)
            setPreview(null)
          }
        })
        .finally(() => setBusy(false))
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturing, onChange])

  const displayText = capturing
    ? preview || '按下新的快捷键...'
    : value || '未设置'

  const handleReset = async (): Promise<void> => {
    if (!defaultAccel) return
    setBusy(true)
    setError(null)
    const result = await onChange(defaultAccel)
    if (!result.ok) setError(result.error || '注册失败')
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          ref={boxRef}
          onClick={() => {
            setCapturing(c => !c)
            setError(null)
            setPreview(null)
          }}
          disabled={busy}
          className={`flex-1 text-xs px-3 py-2 rounded-lg border font-mono transition-colors ${
            capturing
              ? 'bg-accent-cyan/10 border-accent-cyan/50 text-accent-cyan'
              : 'bg-bg-elevated border-bg-border text-txt-primary hover:border-txt-muted/30'
          }`}
        >
          {displayText}
        </button>
        {defaultAccel && value !== defaultAccel && (
          <button
            onClick={handleReset}
            disabled={busy}
            className="text-[10px] px-2 py-2 rounded-lg text-txt-secondary hover:bg-bg-elevated transition-colors disabled:opacity-40"
          >
            恢复默认
          </button>
        )}
      </div>
      {error && (
        <p className="text-[10px] text-danger">{error}</p>
      )}
      <p className="text-[10px] text-txt-muted">
        {capturing ? '按 Esc 取消' : '点击上方按钮，然后按下组合键录入（需至少一个修饰键）'}
      </p>
    </div>
  )
}

export default HotkeyCapture
