import { useEffect, useState } from 'react';
import './App.css';
import { ATEMDevice, SyncSettings } from '../shared/types';
import ConnectionPanel from './components/ConnectionPanel';
import SyncSettingsPanel from './components/SyncSettings';

function App() {
  const [devices, setDevices] = useState<ATEMDevice[]>([
    { id: 'local', ip: '', label: 'Local ATEM', type: 'local', connected: false },
  ]);
  const [syncSettings, setSyncSettingsState] = useState<SyncSettings>({
    syncEnabled: true,
    localToRemote: true,
    remoteToLocal: true,
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
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load saved configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        try {
          const config = await window.electronAPI.loadConfig();
          setDevices(config.devices);
          setSyncSettingsState(config.syncSettings);
          setConfigLoaded(true);
          console.log('Loaded configuration:', config);
        } catch (error) {
          console.error('Failed to load config:', error);
          setConfigLoaded(true);
        }
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    // Listen for state changes
    if (window.electronAPI) {
      window.electronAPI.onStateChange((data) => {
        console.log('State change:', data);
      });

      window.electronAPI.onConnectionChange((data) => {
        console.log('Connection change:', data);
        updateDeviceStatus();
      });

      updateDeviceStatus();
    }
  }, []);

  // Save config whenever devices or sync settings change (after initial load)
  useEffect(() => {
    if (configLoaded && window.electronAPI) {
      window.electronAPI.saveConfig({ devices, syncSettings });
      console.log('Saved configuration');
    }
  }, [devices, syncSettings, configLoaded]);

  const updateDeviceStatus = async () => {
    if (window.electronAPI) {
      const status = await window.electronAPI.getATEMStatus();
      console.log('ATEM Status:', status);
      
      // Update local device states based on manager status
      setDevices(prevDevices =>
        prevDevices.map(device => ({
          ...device,
          connected: status[device.id]?.connected ?? false,
        }))
      );
    }
  };

  const handleAddRemote = () => {
    const newRemote: ATEMDevice = {
      id: `remote-${Date.now()}`,
      ip: '',
      label: `Remote ATEM ${devices.filter((d) => d.type === 'remote').length + 1}`,
      type: 'remote',
      connected: false,
    };
    setDevices([...devices, newRemote]);
  };

  const handleRemoveRemote = (id: string) => {
    if (id !== 'local') {
      setDevices(devices.filter((d) => d.id !== id));
    }
  };

  const handleUpdateDevice = (id: string, updates: Partial<ATEMDevice>) => {
    setDevices(prevDevices =>
      prevDevices.map(device =>
        device.id === id ? { ...device, ...updates } : device
      )
    );
  };

  const handleUpdateSyncSettings = async (newSettings: Partial<SyncSettings>) => {
    const updated = { ...syncSettings, ...newSettings };
    setSyncSettingsState(updated);
    if (window.electronAPI) {
      await window.electronAPI.setSyncSettings(updated);
    }
  };

  return (
    <div className='App'>
      <header className='App-header'>
        <h1>ATEM Sync Manager</h1>
      </header>
      <main className='App-main'>
        <div className='panels-container'>
          {devices.map((device) => (
            <ConnectionPanel
              key={device.id}
              device={device}
              onRemove={handleRemoveRemote}
              onUpdate={handleUpdateDevice}
            />
          ))}
          <button className='btn-add-remote' onClick={handleAddRemote}>
            + Add Remote ATEM
          </button>
        </div>
        <SyncSettingsPanel settings={syncSettings} onUpdate={handleUpdateSyncSettings} />
      </main>
    </div>
  );
}

export default App;
