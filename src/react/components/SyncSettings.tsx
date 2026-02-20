import React from 'react';
import { SyncSettings as SyncSettingsType } from '../../shared/types';

interface SyncSettingsProps {
  settings: SyncSettingsType;
  onUpdate: (settings: Partial<SyncSettingsType>) => void;
}

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

const Toggle: React.FC<ToggleProps> = ({ id, checked, onChange, disabled, label }) => (
  <div className='toggle-group'>
    <div className='toggle-switch'>
      <input
        type='checkbox'
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className='toggle-track' onClick={() => !disabled && onChange(!checked)} />
    </div>
    <label htmlFor={id} className={disabled ? 'disabled' : ''}>{label}</label>
  </div>
);

const SyncSettings: React.FC<SyncSettingsProps> = ({ settings, onUpdate }) => {
  const disabled = !settings.syncEnabled;

  return (
    <div className='sync-settings'>
      <div className='settings-section'>
        <div className='sync-master-toggle'>
          <div className='toggle-switch'>
            <input
              type='checkbox'
              id='syncEnabled'
              checked={settings.syncEnabled}
              onChange={(e) => onUpdate({ syncEnabled: e.target.checked })}
            />
            <span className='toggle-track' onClick={() => onUpdate({ syncEnabled: !settings.syncEnabled })} />
          </div>
          <span className='sync-label'>Sync {settings.syncEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      <div className='settings-section'>
        <div className='sync-direction'>
          Direction: <span>Master → Slave</span> (one-way)
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Video Switching</div>
        <div className='settings-grid'>
          <Toggle id='watchInputs' checked={settings.watchInputs} onChange={(v) => onUpdate({ watchInputs: v })} disabled={disabled} label='Pgm/Pvw' />
          <Toggle id='watchTransitions' checked={settings.watchTransitions} onChange={(v) => onUpdate({ watchTransitions: v })} disabled={disabled} label='Transitions' />
          <Toggle id='watchEffects' checked={settings.watchEffects} onChange={(v) => onUpdate({ watchEffects: v })} disabled={disabled} label='Fade to Black' />
          <Toggle id='watchAux' checked={settings.watchAux} onChange={(v) => onUpdate({ watchAux: v })} disabled={disabled} label='AUX' />
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Keyers</div>
        <div className='settings-grid'>
          <Toggle id='watchKeys' checked={settings.watchKeys} onChange={(v) => onUpdate({ watchKeys: v })} disabled={disabled} label='USK/DSK' />
          <Toggle id='watchSuperSource' checked={settings.watchSuperSource} onChange={(v) => onUpdate({ watchSuperSource: v })} disabled={disabled} label='SuperSource' />
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Audio & Media</div>
        <div className='settings-grid'>
          <Toggle id='watchAudio' checked={settings.watchAudio} onChange={(v) => onUpdate({ watchAudio: v })} disabled={disabled} label='Audio' />
          <Toggle id='watchMediaPlayers' checked={settings.watchMediaPlayers} onChange={(v) => onUpdate({ watchMediaPlayers: v })} disabled={disabled} label='Media' />
          <Toggle id='watchColorGenerators' checked={settings.watchColorGenerators} onChange={(v) => onUpdate({ watchColorGenerators: v })} disabled={disabled} label='Color Gen' />
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Other</div>
        <div className='settings-grid'>
          <Toggle id='watchMacros' checked={settings.watchMacros} onChange={(v) => onUpdate({ watchMacros: v })} disabled={disabled} label='Macros' />
          <Toggle id='watchMultiviewer' checked={settings.watchMultiviewer} onChange={(v) => onUpdate({ watchMultiviewer: v })} disabled={disabled} label='Multiviewer' />
          <Toggle id='watchStreaming' checked={settings.watchStreaming} onChange={(v) => onUpdate({ watchStreaming: v })} disabled={disabled} label='Stream/Rec' />
        </div>
      </div>

      <div className='settings-section'>
        <div className='settings-title'>Sync Delay</div>
        <div className='slider-group'>
          <input
            id='syncDelay'
            type='range'
            min='0'
            max='500'
            step='10'
            value={settings.syncDelay}
            onChange={(e) => onUpdate({ syncDelay: parseInt(e.target.value) })}
            disabled={disabled}
          />
          <span className='slider-value'>{settings.syncDelay}ms</span>
        </div>
      </div>
    </div>
  );
};

export default SyncSettings;
