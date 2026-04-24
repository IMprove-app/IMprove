import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings, updateSettings } from './db'

const TASKS_WIDTH = 520
const TASKS_HEIGHT = 72
const TASKS_MIN_WIDTH = 320
const TASKS_MIN_HEIGHT = 56
const TASKS_MAX_WIDTH = 1600
const TASKS_MAX_HEIGHT = 240

let tasksWindow: BrowserWindow | null = null
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

export function getTasksWindow(): BrowserWindow | null {
  return tasksWindow && !tasksWindow.isDestroyed() ? tasksWindow : null
}

function computeSpawnBounds(): { x: number; y: number; width: number; height: number } {
  const settings = getSettings()
  const saved = settings.tasksBounds
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
        width: Math.max(TASKS_MIN_WIDTH, Math.min(TASKS_MAX_WIDTH, saved.width || TASKS_WIDTH)),
        height: Math.max(TASKS_MIN_HEIGHT, Math.min(TASKS_MAX_HEIGHT, saved.height || TASKS_HEIGHT))
      }
    }
  }

  // Default: top-center of the display under the cursor.
  const x = Math.round(work.x + (work.width - TASKS_WIDTH) / 2)
  const y = Math.round(work.y + 24)
  return { x, y, width: TASKS_WIDTH, height: TASKS_HEIGHT }
}

function persistBoundsDebounced(): void {
  if (!tasksWindow || tasksWindow.isDestroyed()) return
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    if (!tasksWindow || tasksWindow.isDestroyed()) return
    const b = tasksWindow.getBounds()
    updateSettings({ tasksBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
  }, 400)
}

export function createTasks(): BrowserWindow {
  if (tasksWindow && !tasksWindow.isDestroyed()) return tasksWindow

  const bounds = computeSpawnBounds()
  const settings = getSettings()

  tasksWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: TASKS_MIN_WIDTH,
    minHeight: TASKS_MIN_HEIGHT,
    maxWidth: TASKS_MAX_WIDTH,
    maxHeight: TASKS_MAX_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    alwaysOnTop: settings.tasksPinned === true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (settings.tasksPinned) {
    tasksWindow.setAlwaysOnTop(true, 'floating')
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    tasksWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/tasks`)
  } else {
    tasksWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/tasks' })
  }

  tasksWindow.on('move', persistBoundsDebounced)
  tasksWindow.on('resize', persistBoundsDebounced)

  tasksWindow.on('blur', () => {
    const s = getSettings()
    if (s.tasksPinned) return
    setTimeout(() => {
      if (tasksWindow && !tasksWindow.isDestroyed() && !tasksWindow.isFocused()) {
        tasksWindow.hide()
      }
    }, 120)
  })

  tasksWindow.on('closed', () => {
    tasksWindow = null
  })

  return tasksWindow
}

export function showTasks(): void {
  const win = tasksWindow && !tasksWindow.isDestroyed() ? tasksWindow : createTasks()
  const bounds = computeSpawnBounds()
  const settings = getSettings()
  if (!settings.tasksBounds) {
    win.setBounds(bounds)
  }
  if (settings.tasksPinned) {
    win.show()
    win.focus()
  } else {
    win.showInactive()
    win.focus()
  }
}

export function hideTasks(): void {
  if (tasksWindow && !tasksWindow.isDestroyed()) tasksWindow.hide()
}

export function toggleTasks(): void {
  if (tasksWindow && !tasksWindow.isDestroyed() && tasksWindow.isVisible()) {
    hideTasks()
  } else {
    showTasks()
  }
}

export function setTasksPinned(pinned: boolean): void {
  updateSettings({ tasksPinned: pinned })
  if (tasksWindow && !tasksWindow.isDestroyed()) {
    tasksWindow.setAlwaysOnTop(pinned, 'floating')
  }
}
