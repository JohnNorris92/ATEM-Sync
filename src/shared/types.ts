declare global {
  interface Window {
    electronAPI: {
      connectATEM: (id: string, ip: string) => Promise<any>;
      disconnectATEM: (id: string) => Promise<any>;
      getATEMStatus: () => Promise<any>;
      setSyncSettings: (settings: any) => Promise<any>;
      loadConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<any>;
      onStateChange: (callback: (data: any) => void) => void;
      onConnectionChange: (callback: (data: any) => void) => void;
    };
  }
}

export interface ATEMDevice {
  id: string;
  ip: string;
  connected: boolean;
  label: string;
  type: 'local' | 'remote';
}

export interface SyncSettings {
  syncEnabled: boolean;
  localToRemote: boolean;
  remoteToLocal: boolean;
  syncDelay: number;
  watchInputs: boolean;
  watchTransitions: boolean;
  watchAudio: boolean;
  watchEffects: boolean;
}

export interface AppConfig {
  devices: ATEMDevice[];
  syncSettings: SyncSettings;
}
