import { useEffect, useState } from 'react';
import './App.css';
import { ATEMDevice, SyncSettings } from '../shared/types';
import ConnectionPanel from './components/ConnectionPanel';
import SyncSettingsPanel from './components/SyncSettings';

function App() {
  const [devices, setDevices] = useState<ATEMDevice[]>([
    { id: 'master', ip: '', label: 'Master ATEM', type: 'master', connected: false, software: 'atem', port: 9910 },
  ]);
  const [syncSettings, setSyncSettingsState] = useState<SyncSettings>({
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

  const handleAddSlave = () => {
    const newSlave: ATEMDevice = {
      id: `slave-${Date.now()}`,
      ip: '',
      label: `Slave ATEM ${devices.filter((d) => d.type === 'slave').length + 1}`,
      type: 'slave',
      connected: false,
      software: 'atem',
      port: 9910,
    };
    setDevices([...devices, newSlave]);
  };

  const handleRemoveSlave = (id: string) => {
    if (id !== 'master') {
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
        <h1>ATEM Sync</h1>
        <div className='sync-status-badge'>
          <span className={`status-dot ${syncSettings.syncEnabled ? 'active' : 'inactive'}`} />
          <span className={`status-label ${syncSettings.syncEnabled ? 'active' : 'inactive'}`}>
            Sync: {syncSettings.syncEnabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </header>
      <main className='App-main'>
        <div className='devices-column'>
          <h2 className='column-heading'>Devices</h2>
          {devices.map((device) => (
            <ConnectionPanel
              key={device.id}
              device={device}
              onRemove={handleRemoveSlave}
              onUpdate={handleUpdateDevice}
            />
          ))}
          <button className='btn-add-slave' onClick={handleAddSlave}>
            + Add Slave
          </button>
        </div>
        <div className='settings-column'>
          <h2 className='column-heading'>Sync Settings</h2>
          <SyncSettingsPanel settings={syncSettings} onUpdate={handleUpdateSyncSettings} />
        </div>
      </main>
    </div>
  );
}

export default App;
