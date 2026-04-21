import { globalShortcut } from 'electron'
import { getSettings, updateSettings, DEFAULT_HUD_HOTKEY } from './db'
import { toggleHud } from './hud'

let currentAccel: string = ''

function safeUnregister(accel: string): void {
  if (!accel) return
  try {
    globalShortcut.unregister(accel)
  } catch {
    // ignore — unknown accelerator strings from bad input shouldn't crash
  }
}

export function registerHudHotkey(accel: string): { ok: boolean; error?: string } {
  const next = (accel ?? '').trim()

  // Allow clearing the hotkey by passing empty string.
  if (!next) {
    safeUnregister(currentAccel)
    currentAccel = ''
    return { ok: true }
  }

  // If the requested accelerator is already bound to us, no-op.
  if (next === currentAccel && globalShortcut.isRegistered(next)) {
    return { ok: true }
  }

  // Unregister old first so we can fall back if the new one fails.
  const previous = currentAccel
  safeUnregister(previous)

  let ok = false
  try {
    ok = globalShortcut.register(next, () => toggleHud())
  } catch (e) {
    // On Windows, malformed accelerators throw — treat as conflict.
    if (previous) {
      try {
        globalShortcut.register(previous, () => toggleHud())
        currentAccel = previous
      } catch {
        currentAccel = ''
      }
    }
    return { ok: false, error: `无效的快捷键：${String(e)}` }
  }

  if (!ok) {
    if (previous) {
      try {
        if (globalShortcut.register(previous, () => toggleHud())) {
          currentAccel = previous
        } else {
          currentAccel = ''
        }
      } catch {
        currentAccel = ''
      }
    } else {
      currentAccel = ''
    }
    return { ok: false, error: '该快捷键已被其它程序占用' }
  }

  currentAccel = next
  return { ok: true }
}

export function setHudHotkey(accel: string): { ok: boolean; error?: string } {
  const outcome = registerHudHotkey(accel)
  if (outcome.ok) {
    updateSettings({ hudHotkey: accel })
  }
  return outcome
}

export function initHudHotkey(): void {
  const settings = getSettings()
  const accel = settings.hudHotkey || DEFAULT_HUD_HOTKEY
  registerHudHotkey(accel)
}

export function getRegisteredHotkey(): string {
  return currentAccel
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
  currentAccel = ''
}
