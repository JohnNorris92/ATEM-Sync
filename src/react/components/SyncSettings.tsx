import React from 'react';
import { SyncSettings as SyncSettingsType } from '../../shared/types';

interface SyncSettingsProps {
  settings: SyncSettingsType;
  onUpdate: (settings: Partial<SyncSettingsType>) => void;
}

const SyncSettings: React.FC<SyncSettingsProps> = ({ settings, onUpdate }) => {
  return (
    <div className='sync-settings'>
      <div className='settings-section'>
        <div className='settings-title'>Sync Direction</div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='syncEnabled'
            checked={settings.syncEnabled}
            onChange={(e) => onUpdate({ syncEnabled: e.target.checked })}
          />
          <label htmlFor='syncEnabled'>Sync Enabled</label>
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Sync Modes</div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='localToRemote'
            checked={settings.localToRemote}
            onChange={(e) => onUpdate({ localToRemote: e.target.checked })}
            disabled={!settings.syncEnabled}
          />
          <label htmlFor='localToRemote'>Local → Remote</label>
        </div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='remoteToLocal'
            checked={settings.remoteToLocal}
            onChange={(e) => onUpdate({ remoteToLocal: e.target.checked })}
            disabled={!settings.syncEnabled}
          />
          <label htmlFor='remoteToLocal'>Remote → Local</label>
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Watch Events</div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='watchInputs'
            checked={settings.watchInputs}
            onChange={(e) => onUpdate({ watchInputs: e.target.checked })}
            disabled={!settings.syncEnabled}
          />
          <label htmlFor='watchInputs'>Input Changes</label>
        </div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='watchTransitions'
            checked={settings.watchTransitions}
            onChange={(e) => onUpdate({ watchTransitions: e.target.checked })}
            disabled={!settings.syncEnabled}
          />
          <label htmlFor='watchTransitions'>Transitions</label>
        </div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='watchAudio'
            checked={settings.watchAudio}
            onChange={(e) => onUpdate({ watchAudio: e.target.checked })}
            disabled={!settings.syncEnabled}
          />
          <label htmlFor='watchAudio'>Audio Levels</label>
        </div>
        <div className='checkbox-group'>
          <input
            type='checkbox'
            id='watchEffects'
            checked={settings.watchEffects}
            onChange={(e) => onUpdate({ watchEffects: e.target.checked })}
            disabled={!settings.syncEnabled}
          />
          <label htmlFor='watchEffects'>Effects</label>
        </div>
      </div>

      <div className='settings-section'>
        <div className='slider-group'>
          <label htmlFor='syncDelay'>Sync Delay (ms):</label>
          <input
            id='syncDelay'
            type='range'
            min='0'
            max='500'
            step='10'
            value={settings.syncDelay}
            onChange={(e) => onUpdate({ syncDelay: parseInt(e.target.value) })}
            disabled={!settings.syncEnabled}
          />
          <span className='slider-value'>{settings.syncDelay}ms</span>
        </div>
      </div>
    </div>
  );
};

export default SyncSettings;
