const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const os = require('node:os')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// Example IPC handler: renderer calls window.api.getPlatformInfo()
ipcMain.handle('app:get-platform-info', () => ({
  platform: process.platform,
  arch: process.arch,
  hostname: os.hostname(),
  appVersion: app.getVersion(),
}))

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
