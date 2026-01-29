import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import Store from 'electron-store';
import { ATEMConnectionManager } from './atemManager';
import { AppConfig } from '../shared/types';

declare const __dirname: string;

let mainWindow: BrowserWindow | null;
const atemManager = new ATEMConnectionManager();

// Initialize persistent storage
const store = new Store<AppConfig>({
  defaults: {
    devices: [
      { id: 'local', ip: '', label: 'Local ATEM', type: 'local', connected: false }
    ],
    syncSettings: {
      syncEnabled: true,
      localToRemote: true,
      remoteToLocal: true,
      syncDelay: 50,
      watchInputs: true,
      watchTransitions: true,
      watchAudio: true,
      watchEffects: true,
    }
  }
});

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers for config persistence
ipcMain.handle('load-config', async (event) => {
  const config = {
    devices: store.get('devices'),
    syncSettings: store.get('syncSettings')
  };
  
  // Restore sync settings to ATEM manager
  atemManager.setSyncSettings(config.syncSettings);
  
  return config;
});

ipcMain.handle('save-config', async (event, config: AppConfig) => {
  store.set('devices', config.devices);
  store.set('syncSettings', config.syncSettings);
  return { success: true };
});

// IPC Handlers
ipcMain.handle('connect-atem', async (event, { id, ip }) => {
  try {
    await atemManager.connect(id, ip);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('disconnect-atem', async (event, { id }) => {
  try {
    await atemManager.disconnect(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('get-atem-status', async (event) => {
  return atemManager.getStatus();
});

ipcMain.handle('set-sync-settings', async (event, settings) => {
  atemManager.setSyncSettings(settings);
  store.set('syncSettings', settings);
  return { success: true };
});

ipcMain.handle('get-state-logs', async (event, limit?: number) => {
  return atemManager.getStateLogs(limit);
});

ipcMain.handle('clear-state-logs', async (event) => {
  atemManager.clearStateLogs();
  return { success: true };
});

// Forward ATEM events to renderer
atemManager.on('state-change', (data: any) => {
  if (mainWindow) {
    mainWindow.webContents.send('atem-state-change', data);
  }
});

atemManager.on('state-log', (log: any) => {
  if (mainWindow) {
    mainWindow.webContents.send('atem-state-log', log);
  }
});

atemManager.on('connection-change', (id: string, connected: boolean) => {
  if (mainWindow) {
    mainWindow.webContents.send('atem-connection-change', { id, connected });
  }
});
