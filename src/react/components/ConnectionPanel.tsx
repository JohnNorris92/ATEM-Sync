import React, { useState, useEffect } from 'react';
import { ATEMDevice } from '../../shared/types';

interface ConnectionPanelProps {
  device: ATEMDevice;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ATEMDevice>) => void;
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ device, onRemove, onUpdate }) => {
  const [ip, setIp] = useState(device.ip);
  const [label, setLabel] = useState(device.label);
  const [isConnecting, setIsConnecting] = useState(false);

  // Sync local state with props when device changes (e.g., when config is loaded)
  useEffect(() => {
    setIp(device.ip);
    setLabel(device.label);
  }, [device.ip, device.label]);

  const handleIpChange = (newIp: string) => {
    setIp(newIp);
    onUpdate(device.id, { ip: newIp });
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    onUpdate(device.id, { label: newLabel });
  };

  const handleConnect = async () => {
    if (!ip) return;
    setIsConnecting(true);
    try {
      await window.electronAPI.connectATEM(device.id, ip);
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsConnecting(true);
    try {
      await window.electronAPI.disconnectATEM(device.id);
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className='panel'>
      <div className='panel-header'>
        <div>
          <span className={`status-indicator ${device.connected ? 'connected' : 'disconnected'}`}></span>
          <input
            type='text'
            className='panel-title-input'
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            disabled={device.type === 'local'}
          />
        </div>
        {device.type === 'remote' && (
          <button
            className='btn-secondary'
            onClick={() => onRemove(device.id)}
            style={{ width: 'auto', padding: '5px 10px' }}
          >
            Remove
          </button>
        )}
      </div>

      <div className='input-group'>
        <label>IP Address</label>
        <input
          type='text'
          placeholder='e.g., 192.168.1.100'
          value={ip}
          onChange={(e) => handleIpChange(e.target.value)}
          disabled={device.connected}
        />
      </div>

      <div className='button-group'>
        {!device.connected ? (
          <button
            className='btn-primary'
            onClick={handleConnect}
            disabled={!ip || isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button
            className='btn-danger'
            onClick={handleDisconnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectionPanel;
