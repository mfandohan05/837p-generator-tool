const { contextBridge, ipcRenderer } = require('electron')

// Expose a minimal, explicit API. Add one method per capability; never expose
// ipcRenderer itself or accept arbitrary channel names from the renderer.
contextBridge.exposeInMainWorld('api', {
  getPlatformInfo: () => ipcRenderer.invoke('app:get-platform-info'),
})
