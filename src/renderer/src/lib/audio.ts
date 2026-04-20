// 短促打卡音效（Web Audio API）
// 设计：528Hz 基音 + 660Hz 三度泛音，~0.8s 衰减

import { shouldReduceMotion } from './motionPrefs'

type AudioCtxCtor = typeof AudioContext

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    if (ctx) return ctx
    const W = window as unknown as {
      AudioContext?: AudioCtxCtor
      webkitAudioContext?: AudioCtxCtor
    }
    const Ctor = W.AudioContext || W.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

/**
 * 播放一个短促的「叮」音，用于打卡结束。
 * 528Hz 正弦 + 660Hz 三度泛音，衰减 ~0.8s。
 * 当 shouldReduceMotion() 为 true 时静音不播放。
 */
export function playSessionStopTone(): void {
  if (shouldReduceMotion()) return
  const ac = getContext()
  if (!ac) return

  try {
    // 用户首次交互前 AudioContext 可能 suspended
    if (ac.state === 'suspended') {
      ac.resume().catch(() => { /* noop */ })
    }

    const now = ac.currentTime
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02) // 起始 ramp 20ms
    gain.gain.setValueAtTime(0.2, now + 0.12)         // hold 100ms
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72) // 衰减 600ms

    // 基础 528Hz
    const osc1 = ac.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(528, now)

    // 泛音 660Hz，音量 30%
    const osc2 = ac.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(660, now)
    const harmonicGain = ac.createGain()
    harmonicGain.gain.setValueAtTime(0.3, now)

    osc1.connect(gain)
    osc2.connect(harmonicGain)
    harmonicGain.connect(gain)
    gain.connect(ac.destination)

    const stopAt = now + 0.8
    osc1.start(now)
    osc2.start(now)
    osc1.stop(stopAt)
    osc2.stop(stopAt)

    const cleanup = (): void => {
      try {
        osc1.disconnect()
      } catch { /* noop */ }
      try {
        osc2.disconnect()
      } catch { /* noop */ }
      try {
        harmonicGain.disconnect()
      } catch { /* noop */ }
      try {
        gain.disconnect()
      } catch { /* noop */ }
    }
    osc1.onended = cleanup
  } catch {
    /* 自动播放策略等异常，吞掉 */
  }
}
