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
      { id: 'master', ip: '', label: 'Master ATEM', type: 'master', connected: false, software: 'atem' as const, port: 9910 }
    ],
    syncSettings: {
      syncEnabled: true,
      syncDelay: 50,
      watchInputs: true,
      watchTransitions: true,
      watchAudio: true,
      watchEffects: true,
      watchKeys: true,
      watchAux: true,
      watchMacros: true,
      watchMediaPlayers: true,
      watchSuperSource: true,
      watchMultiviewer: false,
      watchColorGenerators: true,
      watchStreaming: false,
    }
  }
});

// One-time migration: convert old local/remote config to master/slave
function migrateConfig(): void {
  const devices = store.get('devices') as any[];
  let migrated = false;

  const newDevices = devices.map((d: any) => {
    if (d.id === 'local') {
      migrated = true;
      return { ...d, id: 'master', type: 'master', label: 'Master ATEM' };
    }
    if (d.type === 'remote' || (d.id && d.id.startsWith('remote-'))) {
      migrated = true;
      const newId = d.id.replace(/^remote-/, 'slave-');
      return { ...d, id: newId, type: 'slave', label: d.label.replace('Remote', 'Slave') };
    }
    return d;
  });

  if (migrated) {
    store.set('devices', newDevices);
  }

  // Strip old direction fields from syncSettings
  const syncSettings = store.get('syncSettings') as any;
  if ('localToRemote' in syncSettings || 'remoteToLocal' in syncSettings) {
    delete syncSettings.localToRemote;
    delete syncSettings.remoteToLocal;
    store.set('syncSettings', syncSettings);
  }
}

migrateConfig();

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
    ? 'http://localhost:3100'
    : `file://${path.join(__dirname, '../../build/index.html')}`;

  mainWindow.loadURL(startUrl);

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
ipcMain.handle('connect-atem', async (event, { id, ip, software, port }) => {
  try {
    await atemManager.connect(id, ip, software || 'atem', port);
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
