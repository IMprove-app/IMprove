import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc-handlers'
import { closeDb } from './db'
import { createTray } from './tray'
import { initSupabase, getAuthStatus } from './supabase'
import { runSync, startPeriodicSync, stopPeriodicSync } from './sync'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 580,
    minWidth: 320,
    minHeight: 480,
    frame: false,
    transparent: false,
    backgroundColor: '#F2F2F7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Sync on window focus
  mainWindow.on('focus', async () => {
    const auth = await getAuthStatus()
    if (auth.loggedIn) {
      runSync()
    }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.improve')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize Supabase
  initSupabase()

  registerIpcHandlers()
  createWindow()
  createTray(mainWindow!)

  // Auto-updater (only in production)
  if (!is.dev) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('updater:available', info.version)
    })

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('updater:progress', Math.round(progress.percent))
    })

    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('updater:downloaded')
    })

    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('updater:error', err.message)
    })

    ipcMain.handle('updater:check', () => {
      autoUpdater.checkForUpdates()
    })

    ipcMain.handle('updater:download', () => {
      autoUpdater.downloadUpdate()
    })

    ipcMain.handle('updater:install', () => {
      autoUpdater.quitAndInstall()
    })

    // Check for updates after launch
    setTimeout(() => autoUpdater.checkForUpdates(), 5000)
  }

  // Start periodic sync if logged in
  const auth = await getAuthStatus()
  if (auth.loggedIn) {
    runSync()
    startPeriodicSync()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// @ts-expect-error custom property
app.isQuitting = false

app.on('before-quit', () => {
  // @ts-expect-error custom property
  app.isQuitting = true
  stopPeriodicSync()
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
