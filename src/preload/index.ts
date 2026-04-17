import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Habits
  listHabits: () => ipcRenderer.invoke('habits:list'),
  createHabit: (data: Record<string, unknown>) => ipcRenderer.invoke('habits:create', data),
  updateHabit: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('habits:update', id, updates),
  deleteHabit: (id: string) => ipcRenderer.invoke('habits:delete', id),

  // Sessions
  startSession: (habitId: string) => ipcRenderer.invoke('session:start', habitId),
  stopSession: (sessionId: string, activeSec: number) =>
    ipcRenderer.invoke('session:stop', sessionId, activeSec),
  tickSession: (sessionId: string, activeSec: number, idleSec: number) =>
    ipcRenderer.invoke('session:tick', sessionId, activeSec, idleSec),
  getActiveSession: () => ipcRenderer.invoke('session:active'),

  // Stats
  getStats: (range: string) => ipcRenderer.invoke('stats:get', range),

  // Auth
  login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
  register: (email: string, password: string) => ipcRenderer.invoke('auth:register', email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),

  // Sync
  triggerSync: () => ipcRenderer.invoke('sync:trigger'),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  onSyncStatus: (callback: (status: { state: string; lastSync: string | null; error?: string }) => void) => {
    const handler = (_e: unknown, status: { state: string; lastSync: string | null; error?: string }) => callback(status)
    ipcRenderer.on('sync:status', handler)
    return () => { ipcRenderer.removeListener('sync:status', handler) }
  },

  // Decks
  listDecks: () => ipcRenderer.invoke('decks:list'),
  createDeck: (data: { id: string; name: string }) => ipcRenderer.invoke('decks:create', data),
  updateDeck: (id: string, updates: { name?: string }) => ipcRenderer.invoke('decks:update', id, updates),
  deleteDeck: (id: string) => ipcRenderer.invoke('decks:delete', id),

  // Cards
  listCards: (deckId: string) => ipcRenderer.invoke('cards:list', deckId),
  createCardsBatch: (cards: { id: string; deck_id: string; front: string; back: string }[]) =>
    ipcRenderer.invoke('cards:create-batch', cards),
  updateCard: (id: string, updates: { front?: string; back?: string }) =>
    ipcRenderer.invoke('cards:update', id, updates),
  deleteCard: (id: string) => ipcRenderer.invoke('cards:delete', id),

  // Review
  getDueCards: () => ipcRenderer.invoke('review:due'),
  getDueCardCount: () => ipcRenderer.invoke('review:due-count'),
  reviewRemembered: (cardId: string) => ipcRenderer.invoke('review:remembered', cardId),
  reviewForgot: (cardId: string) => ipcRenderer.invoke('review:forgot', cardId),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Auto-updater
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (callback: (version: string) => void) => {
    const handler = (_e: unknown, version: string) => callback(version)
    ipcRenderer.on('updater:available', handler)
    return () => { ipcRenderer.removeListener('updater:available', handler) }
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_e: unknown, percent: number) => callback(percent)
    ipcRenderer.on('updater:progress', handler)
    return () => { ipcRenderer.removeListener('updater:progress', handler) }
  },
  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('updater:downloaded', handler)
    return () => { ipcRenderer.removeListener('updater:downloaded', handler) }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
