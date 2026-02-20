import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  connectATEM: (id: string, ip: string, software: 'atem' | 'vmix', port: number) =>
    ipcRenderer.invoke('connect-atem', { id, ip, software, port }),
  disconnectATEM: (id: string) =>
    ipcRenderer.invoke('disconnect-atem', { id }),
  getATEMStatus: () =>
    ipcRenderer.invoke('get-atem-status'),
  setSyncSettings: (settings: any) =>
    ipcRenderer.invoke('set-sync-settings', settings),
  getStateLogs: (limit?: number) =>
    ipcRenderer.invoke('get-state-logs', limit),
  clearStateLogs: () =>
    ipcRenderer.invoke('clear-state-logs'),
  loadConfig: () =>
    ipcRenderer.invoke('load-config'),
  saveConfig: (config: any) =>
    ipcRenderer.invoke('save-config', config),
  onStateChange: (callback: (data: any) => void) =>
    ipcRenderer.on('atem-state-change', (_, data) => callback(data)),
  onStateLog: (callback: (data: any) => void) =>
    ipcRenderer.on('atem-state-log', (_, data) => callback(data)),
  onConnectionChange: (callback: (data: any) => void) =>
    ipcRenderer.on('atem-connection-change', (_, data) => callback(data)),
});
