import { BrowserWindow, screen, clipboard } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings, updateSettings } from './db'

const HUD_WIDTH = 340
const HUD_HEIGHT = 420
const HUD_MIN_WIDTH = 280
const HUD_MIN_HEIGHT = 260

let hudWindow: BrowserWindow | null = null
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

export function getHudWindow(): BrowserWindow | null {
  return hudWindow && !hudWindow.isDestroyed() ? hudWindow : null
}

function computeSpawnBounds(): { x: number; y: number; width: number; height: number } {
  const settings = getSettings()
  const saved = settings.hudBounds
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const work = display.workArea

  // Try saved bounds; accept only if they still intersect some display.
  if (saved) {
    const allDisplays = screen.getAllDisplays()
    const intersects = allDisplays.some(d => {
      const w = d.workArea
      return (
        saved.x + saved.width > w.x &&
        saved.y + saved.height > w.y &&
        saved.x < w.x + w.width &&
        saved.y < w.y + w.height
      )
    })
    if (intersects) {
      return {
        x: saved.x,
        y: saved.y,
        width: Math.max(HUD_MIN_WIDTH, saved.width || HUD_WIDTH),
        height: Math.max(HUD_MIN_HEIGHT, saved.height || HUD_HEIGHT)
      }
    }
  }

  // Default: top-center of the display under the cursor.
  const x = Math.round(work.x + (work.width - HUD_WIDTH) / 2)
  const y = Math.round(work.y + 80)
  return { x, y, width: HUD_WIDTH, height: HUD_HEIGHT }
}

function persistBoundsDebounced(): void {
  if (!hudWindow || hudWindow.isDestroyed()) return
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    if (!hudWindow || hudWindow.isDestroyed()) return
    const b = hudWindow.getBounds()
    updateSettings({ hudBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
  }, 400)
}

export function createHud(): BrowserWindow {
  if (hudWindow && !hudWindow.isDestroyed()) return hudWindow

  const bounds = computeSpawnBounds()
  const settings = getSettings()

  hudWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: HUD_MIN_WIDTH,
    minHeight: HUD_MIN_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    alwaysOnTop: settings.hudPinned === true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (settings.hudPinned) {
    hudWindow.setAlwaysOnTop(true, 'floating')
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/hud`)
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/hud' })
  }

  hudWindow.on('move', persistBoundsDebounced)
  hudWindow.on('resize', persistBoundsDebounced)

  // When not pinned, auto-hide on blur (give the click handler a moment).
  hudWindow.on('blur', () => {
    const s = getSettings()
    if (s.hudPinned) return
    setTimeout(() => {
      if (hudWindow && !hudWindow.isDestroyed() && !hudWindow.isFocused()) {
        hudWindow.hide()
      }
    }, 120)
  })

  hudWindow.on('closed', () => {
    hudWindow = null
  })

  return hudWindow
}

export function showHud(): void {
  const win = hudWindow && !hudWindow.isDestroyed() ? hudWindow : createHud()
  const bounds = computeSpawnBounds()
  // Recompute position based on current cursor unless the user has persisted a location.
  const settings = getSettings()
  if (!settings.hudBounds) {
    win.setBounds(bounds)
  }
  if (settings.hudPinned) {
    win.show()
    win.focus()
  } else {
    // Avoid aggressive focus-steal: show inactive first, then request focus so the user
    // can immediately type into the search box without the HUD fighting the front app.
    win.showInactive()
    win.focus()
  }
}

export function hideHud(): void {
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide()
}

export function toggleHud(): void {
  if (hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
    hideHud()
  } else {
    showHud()
  }
}

export function setHudPinned(pinned: boolean): void {
  updateSettings({ hudPinned: pinned })
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.setAlwaysOnTop(pinned, 'floating')
  }
}

export function copyToClipboard(text: string): void {
  clipboard.writeText(text)
}
