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
        <div className='settings-title'>Sync Control</div>
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
        <div className='settings-title'>Sync Direction</div>
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
        <div className='settings-title'>Video Switching</div>
        <div className='settings-grid'>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchInputs'
              checked={settings.watchInputs}
              onChange={(e) => onUpdate({ watchInputs: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchInputs'>Program/Preview</label>
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
              id='watchEffects'
              checked={settings.watchEffects}
              onChange={(e) => onUpdate({ watchEffects: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchEffects'>Fade to Black</label>
          </div>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchAux'
              checked={settings.watchAux}
              onChange={(e) => onUpdate({ watchAux: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchAux'>AUX Outputs</label>
          </div>
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Keyers</div>
        <div className='settings-grid'>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchKeys'
              checked={settings.watchKeys}
              onChange={(e) => onUpdate({ watchKeys: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchKeys'>USK/DSK</label>
          </div>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchSuperSource'
              checked={settings.watchSuperSource}
              onChange={(e) => onUpdate({ watchSuperSource: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchSuperSource'>SuperSource</label>
          </div>
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Audio & Media</div>
        <div className='settings-grid'>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchAudio'
              checked={settings.watchAudio}
              onChange={(e) => onUpdate({ watchAudio: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchAudio'>Audio Mixer</label>
          </div>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchMediaPlayers'
              checked={settings.watchMediaPlayers}
              onChange={(e) => onUpdate({ watchMediaPlayers: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchMediaPlayers'>Media Players</label>
          </div>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchColorGenerators'
              checked={settings.watchColorGenerators}
              onChange={(e) => onUpdate({ watchColorGenerators: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchColorGenerators'>Color Generators</label>
          </div>
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Other</div>
        <div className='settings-grid'>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchMacros'
              checked={settings.watchMacros}
              onChange={(e) => onUpdate({ watchMacros: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchMacros'>Macros</label>
          </div>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchMultiviewer'
              checked={settings.watchMultiviewer}
              onChange={(e) => onUpdate({ watchMultiviewer: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchMultiviewer'>Multiviewer</label>
          </div>
          <div className='checkbox-group'>
            <input
              type='checkbox'
              id='watchStreaming'
              checked={settings.watchStreaming}
              onChange={(e) => onUpdate({ watchStreaming: e.target.checked })}
              disabled={!settings.syncEnabled}
            />
            <label htmlFor='watchStreaming'>Streaming/Recording</label>
          </div>
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
