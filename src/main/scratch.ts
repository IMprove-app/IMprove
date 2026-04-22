import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings, updateSettings } from './db'

const SCRATCH_WIDTH = 480
const SCRATCH_HEIGHT = 380
const SCRATCH_MIN_WIDTH = 360
const SCRATCH_MIN_HEIGHT = 240

let scratchWindow: BrowserWindow | null = null
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

export function getScratchWindow(): BrowserWindow | null {
  return scratchWindow && !scratchWindow.isDestroyed() ? scratchWindow : null
}

function computeSpawnBounds(): { x: number; y: number; width: number; height: number } {
  const settings = getSettings()
  const saved = settings.scratchBounds
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const work = display.workArea

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
        width: Math.max(SCRATCH_MIN_WIDTH, saved.width || SCRATCH_WIDTH),
        height: Math.max(SCRATCH_MIN_HEIGHT, saved.height || SCRATCH_HEIGHT)
      }
    }
  }

  // Default: center of the display under the cursor (scratch wants more room than HUD).
  const x = Math.round(work.x + (work.width - SCRATCH_WIDTH) / 2)
  const y = Math.round(work.y + (work.height - SCRATCH_HEIGHT) / 2)
  return { x, y, width: SCRATCH_WIDTH, height: SCRATCH_HEIGHT }
}

function persistBoundsDebounced(): void {
  if (!scratchWindow || scratchWindow.isDestroyed()) return
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    if (!scratchWindow || scratchWindow.isDestroyed()) return
    const b = scratchWindow.getBounds()
    updateSettings({ scratchBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
  }, 400)
}

export function createScratch(): BrowserWindow {
  if (scratchWindow && !scratchWindow.isDestroyed()) return scratchWindow

  const bounds = computeSpawnBounds()
  const settings = getSettings()

  scratchWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: SCRATCH_MIN_WIDTH,
    minHeight: SCRATCH_MIN_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    alwaysOnTop: settings.scratchPinned === true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (settings.scratchPinned) {
    scratchWindow.setAlwaysOnTop(true, 'floating')
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    scratchWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/scratch`)
  } else {
    scratchWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/scratch' })
  }

  scratchWindow.on('move', persistBoundsDebounced)
  scratchWindow.on('resize', persistBoundsDebounced)

  scratchWindow.on('blur', () => {
    const s = getSettings()
    if (s.scratchPinned) return
    setTimeout(() => {
      if (scratchWindow && !scratchWindow.isDestroyed() && !scratchWindow.isFocused()) {
        scratchWindow.hide()
      }
    }, 120)
  })

  scratchWindow.on('closed', () => {
    scratchWindow = null
  })

  return scratchWindow
}

export function showScratch(): void {
  const win = scratchWindow && !scratchWindow.isDestroyed() ? scratchWindow : createScratch()
  const bounds = computeSpawnBounds()
  const settings = getSettings()
  if (!settings.scratchBounds) {
    win.setBounds(bounds)
  }
  if (settings.scratchPinned) {
    win.show()
    win.focus()
  } else {
    win.showInactive()
    win.focus()
  }
}

export function hideScratch(): void {
  if (scratchWindow && !scratchWindow.isDestroyed()) scratchWindow.hide()
}

export function toggleScratch(): void {
  if (scratchWindow && !scratchWindow.isDestroyed() && scratchWindow.isVisible()) {
    hideScratch()
  } else {
    showScratch()
  }
}

export function setScratchPinned(pinned: boolean): void {
  updateSettings({ scratchPinned: pinned })
  if (scratchWindow && !scratchWindow.isDestroyed()) {
    scratchWindow.setAlwaysOnTop(pinned, 'floating')
  }
}
