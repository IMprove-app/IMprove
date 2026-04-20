// 用户「减弱动画」偏好读取/设置
// 优先级：localStorage 显式设置 > system prefers-reduced-motion

const STORAGE_KEY = 'improve:reduce-motion'

/**
 * 查询用户是否希望减弱动画。
 * 优先读取 localStorage 显式设置，否则跟随系统 prefers-reduced-motion。
 */
export function shouldReduceMotion(): boolean {
  const explicit = getReduceMotionPref()
  if (explicit !== null) return explicit
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  } catch {
    /* noop */
  }
  return false
}

/**
 * 设置用户显式偏好。
 * - true  → 强制减弱
 * - false → 强制正常
 * - null  → 清除显式设置，跟随系统
 */
export function setReduceMotion(value: boolean | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
    }
  } catch {
    /* noop */
  }
}

/**
 * 读取显式偏好；未设置时返回 null（跟随系统）。
 */
export function getReduceMotionPref(): boolean | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'true') return true
    if (v === 'false') return false
    return null
  } catch {
    return null
  }
}
