import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'

let tray: Tray | null = null

function createTrayIcon(): Electron.NativeImage {
  // Generate a 16x16 cyan circle icon as a data URL
  // This is a minimal 16x16 PNG with a cyan (#00E5FF) filled circle
  const size = 16
  const buf = Buffer.alloc(size * size * 4) // RGBA
  const cx = size / 2
  const cy = size / 2
  const r = 6

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= r) {
        buf[idx] = 0x00     // R
        buf[idx + 1] = 0xE5 // G
        buf[idx + 2] = 0xFF // B
        buf[idx + 3] = 0xFF // A
      } else if (dist <= r + 1) {
        // Anti-aliased edge
        const alpha = Math.max(0, Math.min(255, Math.round((r + 1 - dist) * 255)))
        buf[idx] = 0x00
        buf[idx + 1] = 0xE5
        buf[idx + 2] = 0xFF
        buf[idx + 3] = alpha
      } else {
        buf[idx + 3] = 0 // Transparent
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

export function createTray(
  mainWindow: BrowserWindow,
  onToggleHud?: () => void,
  onToggleScratch?: () => void
): Tray {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('IMprove - 每日打卡')

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: '打开主界面',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  ]

  if (onToggleHud) {
    items.push({
      label: '快速粘贴 HUD',
      click: () => onToggleHud()
    })
  }

  if (onToggleScratch) {
    items.push({
      label: '草稿纸',
      click: () => onToggleScratch()
    })
  }

  items.push(
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // @ts-expect-error custom property
        app.isQuitting = true
        app.quit()
      }
    }
  )

  const contextMenu = Menu.buildFromTemplate(items)
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function updateTrayTooltip(text: string): void {
  if (tray) {
    tray.setToolTip(text)
  }
}
