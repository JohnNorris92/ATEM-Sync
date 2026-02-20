declare global {
  interface Window {
    electronAPI: {
      connectATEM: (id: string, ip: string, software: 'atem' | 'vmix', port: number) => Promise<any>;
      disconnectATEM: (id: string) => Promise<any>;
      getATEMStatus: () => Promise<any>;
      setSyncSettings: (settings: any) => Promise<any>;
      getStateLogs: (limit?: number) => Promise<any>;
      clearStateLogs: () => Promise<any>;
      loadConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<any>;
      onStateChange: (callback: (data: any) => void) => void;
      onStateLog: (callback: (data: any) => void) => void;
      onConnectionChange: (callback: (data: any) => void) => void;
    };
  }
}

export interface ATEMDevice {
  id: string;
  ip: string;
  connected: boolean;
  label: string;
  type: 'master' | 'slave';
  software: 'atem' | 'vmix';
  port: number;
}

export interface SyncSettings {
  syncEnabled: boolean;
  syncDelay: number;
  watchInputs: boolean;
  watchTransitions: boolean;
  watchAudio: boolean;
  watchEffects: boolean;
  watchKeys: boolean;
  watchAux: boolean;
  watchMacros: boolean;
  watchMediaPlayers: boolean;
  watchSuperSource: boolean;
  watchMultiviewer: boolean;
  watchColorGenerators: boolean;
  watchStreaming: boolean;
}

export interface AppConfig {
  devices: ATEMDevice[];
  syncSettings: SyncSettings;
}
