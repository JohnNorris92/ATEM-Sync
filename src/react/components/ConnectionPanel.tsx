import React, { useState, useEffect } from 'react';
import { ATEMDevice } from '../../shared/types';

interface ConnectionPanelProps {
  device: ATEMDevice;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ATEMDevice>) => void;
}

const DEFAULT_PORTS: Record<string, number> = {
  atem: 9910,
  vmix: 8099,
};

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

  const handleSoftwareChange = (software: 'atem' | 'vmix') => {
    const port = DEFAULT_PORTS[software];
    onUpdate(device.id, { software, port });
  };

  const handlePortChange = (portStr: string) => {
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      onUpdate(device.id, { port });
    }
  };

  const handleConnect = async () => {
    if (!ip) return;
    setIsConnecting(true);
    try {
      await window.electronAPI.connectATEM(device.id, ip, device.software, device.port);
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
        <div className='panel-header-left'>
          <span className={`status-indicator ${device.connected ? 'connected' : 'disconnected'}`} />
          <input
            type='text'
            className='panel-title-input'
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            disabled={device.type === 'master'}
          />
          <span className={`panel-type-tag ${device.type === 'slave' ? 'slave' : ''}`}>
            {device.type}
          </span>
        </div>
        {device.type === 'slave' && (
          <button className='btn-remove' onClick={() => onRemove(device.id)} title='Remove'>
            ×
          </button>
        )}
      </div>
      <div className='software-selector'>
        <button
          className={`software-btn ${device.software === 'atem' ? 'active' : ''}`}
          onClick={() => handleSoftwareChange('atem')}
          disabled={device.connected}
        >
          ATEM
        </button>
        <button
          className={`software-btn ${device.software === 'vmix' ? 'active' : ''}`}
          onClick={() => handleSoftwareChange('vmix')}
          disabled={device.connected}
        >
          vMix
        </button>
      </div>
      <div className='ip-row'>
        <input
          type='text'
          className='mono'
          placeholder='192.168.1.100'
          value={ip}
          onChange={(e) => handleIpChange(e.target.value)}
          disabled={device.connected}
        />
        <input
          type='text'
          className='mono port-input'
          placeholder='Port'
          value={device.port}
          onChange={(e) => handlePortChange(e.target.value)}
          disabled={device.connected}
        />
        {!device.connected ? (
          <button
            className='btn-connect'
            onClick={handleConnect}
            disabled={!ip || isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button
            className='btn-disconnect'
            onClick={handleDisconnect}
            disabled={isConnecting}
          >
            {isConnecting ? '...' : 'Disconnect'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectionPanel;
