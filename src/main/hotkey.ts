import { globalShortcut } from 'electron'
import {
  getSettings,
  updateSettings,
  DEFAULT_HUD_HOTKEY,
  DEFAULT_SCRATCH_HOTKEY,
  DEFAULT_TASKS_HOTKEY,
  AppSettings
} from './db'
import { toggleHud } from './hud'
import { toggleScratch } from './scratch'
import { toggleTasks } from './tasks'

export type HotkeySlot = 'hud' | 'scratch' | 'tasks'

interface SlotConfig {
  action: () => void
  settingsKey: keyof AppSettings
}

const slotConfigs: Record<HotkeySlot, SlotConfig> = {
  hud: { action: () => toggleHud(), settingsKey: 'hudHotkey' },
  scratch: { action: () => toggleScratch(), settingsKey: 'scratchHotkey' },
  tasks: { action: () => toggleTasks(), settingsKey: 'tasksHotkey' }
}

const ALL_SLOTS: HotkeySlot[] = ['hud', 'scratch', 'tasks']

const registered: Record<HotkeySlot, string> = {
  hud: '',
  scratch: '',
  tasks: ''
}

function safeUnregister(accel: string): void {
  if (!accel) return
  try {
    globalShortcut.unregister(accel)
  } catch {
    // ignore — malformed accelerator strings shouldn't crash
  }
}

// Generic cross-slot collision check: the proposed accelerator must not equal
// any other slot's currently-registered accelerator.
function collidesWithOtherSlot(slot: HotkeySlot, accel: string): boolean {
  for (const other of ALL_SLOTS) {
    if (other === slot) continue
    if (registered[other] && registered[other] === accel) return true
  }
  return false
}

function registerSlot(slot: HotkeySlot, accel: string): { ok: boolean; error?: string } {
  const next = (accel ?? '').trim()
  const cfg = slotConfigs[slot]

  // Clear hotkey by empty string.
  if (!next) {
    safeUnregister(registered[slot])
    registered[slot] = ''
    return { ok: true }
  }

  // Reject cross-slot collision before touching anything.
  if (collidesWithOtherSlot(slot, next)) {
    return { ok: false, error: '与另一个快捷键冲突' }
  }

  // No-op if already bound to this slot.
  if (next === registered[slot] && globalShortcut.isRegistered(next)) {
    return { ok: true }
  }

  const previous = registered[slot]
  safeUnregister(previous)

  let ok = false
  try {
    ok = globalShortcut.register(next, cfg.action)
  } catch (e) {
    if (previous) {
      try {
        globalShortcut.register(previous, cfg.action)
        registered[slot] = previous
      } catch {
        registered[slot] = ''
      }
    }
    return { ok: false, error: `无效的快捷键：${String(e)}` }
  }

  if (!ok) {
    if (previous) {
      try {
        if (globalShortcut.register(previous, cfg.action)) {
          registered[slot] = previous
        } else {
          registered[slot] = ''
        }
      } catch {
        registered[slot] = ''
      }
    } else {
      registered[slot] = ''
    }
    return { ok: false, error: '该快捷键已被其它程序占用' }
  }

  registered[slot] = next
  return { ok: true }
}

function persistSlot(slot: HotkeySlot, accel: string): void {
  updateSettings({ [slotConfigs[slot].settingsKey]: accel } as Partial<AppSettings>)
}

// ===== Public API =====

export function setSlotHotkey(
  slot: HotkeySlot,
  accel: string
): { ok: boolean; error?: string } {
  const outcome = registerSlot(slot, accel)
  if (outcome.ok) {
    persistSlot(slot, accel)
  }
  return outcome
}

export function getRegisteredSlot(slot: HotkeySlot): string {
  return registered[slot]
}

export function initHotkeys(): void {
  const settings = getSettings()
  const hud = settings.hudHotkey || DEFAULT_HUD_HOTKEY
  const scratch = settings.scratchHotkey || DEFAULT_SCRATCH_HOTKEY
  const tasks = settings.tasksHotkey || DEFAULT_TASKS_HOTKEY
  registerSlot('hud', hud)
  registerSlot('scratch', scratch)
  registerSlot('tasks', tasks)
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
  registered.hud = ''
  registered.scratch = ''
  registered.tasks = ''
}

// ===== Legacy single-slot wrappers (kept so existing callers keep compiling) =====

export function registerHudHotkey(accel: string): { ok: boolean; error?: string } {
  return registerSlot('hud', accel)
}

export function setHudHotkey(accel: string): { ok: boolean; error?: string } {
  return setSlotHotkey('hud', accel)
}

export function initHudHotkey(): void {
  const settings = getSettings()
  registerSlot('hud', settings.hudHotkey || DEFAULT_HUD_HOTKEY)
}

export function initTasksHotkey(): void {
  const settings = getSettings()
  registerSlot('tasks', settings.tasksHotkey || DEFAULT_TASKS_HOTKEY)
}

export function getRegisteredHotkey(): string {
  return registered.hud
}
