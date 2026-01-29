import { EventEmitter } from 'events';
import { Atem } from 'atem-connection';

interface ATEMDevice {
  id: string;
  ip: string;
  connected: boolean;
  lastState: any;
  atemConnection?: Atem;
  lastProgramInput?: number;
  lastPreviewInput?: number;
  inTransition?: boolean;
}

interface StateChangeLog {
  timestamp: string;
  deviceId: string;
  deviceIp: string;
  path: string;
  oldValue: any;
  newValue: any;
}

interface SyncSettings {
  syncEnabled: boolean;
  localToRemote: boolean;
  remoteToLocal: boolean;
  syncDelay: number;
  watchInputs: boolean;
  watchTransitions: boolean;
  watchAudio: boolean;
  watchEffects: boolean;
}

export class ATEMConnectionManager extends EventEmitter {
  private devices: Map<string, ATEMDevice> = new Map();
  private stateChangeLogs: StateChangeLog[] = [];
  private maxLogs: number = 500; // Keep last 500 logs
  private syncSettings: SyncSettings = {
    syncEnabled: true,
    localToRemote: true,
    remoteToLocal: true,
    syncDelay: 50,
    watchInputs: true,
    watchTransitions: true,
    watchAudio: true,
    watchEffects: true,
  };

  constructor() {
    super();
  }

  async connect(id: string, ip: string): Promise<void> {
    try {
      // Validate IP address format
      if (!this.isValidIP(ip)) {
        throw new Error('Invalid IP address format');
      }

      const device: ATEMDevice = {
        id,
        ip,
        connected: false,
        lastState: null,
      };

      this.devices.set(id, device);

      // Create ATEM connection
      const atemConnection = new Atem();
      device.atemConnection = atemConnection;

      // Setup info and debug logging
      atemConnection.on('info', (msg: string) => {
        console.log(`[INFO] ATEM ${id}:`, msg);
      });

      atemConnection.on('debug', (msg: string) => {
        // Suppress "Unknown command" debug messages to reduce noise
        if (!msg.includes('Unknown command')) {
          console.log(`[DEBUG] ATEM ${id}:`, msg);
        }
      });

      // Setup error handling
      atemConnection.on('error', (error: any) => {
        console.error(`ATEM ${id} error:`, error);
        this.logStateChange(id, ip, 'connection.error', device.connected, false);
        device.connected = false;
        this.emit('connection-change', id, false);
      });

      // Setup disconnection handling
      atemConnection.on('disconnected', () => {
        console.log(`ATEM ${id} disconnected`);
        this.logStateChange(id, ip, 'connection.disconnected', device.connected, false);
        device.connected = false;
        this.emit('connection-change', id, false);
      });

      // Setup connection success
      atemConnection.on('connected', () => {
        console.log(`Connected to ATEM ${id} at ${ip}`);
        this.logStateChange(id, ip, 'connection.connected', device.connected, true);
        device.connected = true;
        this.emit('connection-change', id, true);
      });

      // Setup state change logging
      atemConnection.on('stateChanged', (state: any, pathArray: string[]) => {
        console.log(`[DEBUG v2] stateChanged event fired for ${id}`);
        device.lastState = state;
        
        // Path comes as a single string in an array, e.g., ['video.mixEffects.0.programInput']
        // Split it into individual segments
        const pathString = pathArray[0];
        const pathSegments = pathString.split('.');
        
        // Navigate to the value using the path segments
        let value = state;
        for (let i = 0; i < pathSegments.length; i++) {
          const key = pathSegments[i];
          const numKey = Number(key);
          
          // Use numeric index if it's a number, otherwise use string key
          if (!isNaN(numKey) && Array.isArray(value)) {
            value = value[numKey];
          } else {
            value = value?.[key];
          }
        }
        
        // Log all state changes
        this.logStateChange(id, ip, pathString, null, value);
        const displayValue = value === undefined ? '(undefined)' : (typeof value === 'object' ? JSON.stringify(value) : value);
        console.log(`ATEM ${id} state changed at ${pathString}:`, displayValue);
        
        // Emit state change event
        this.emit('state-change', {
          deviceId: id,
          deviceIp: ip,
          path: pathString,
          state: value,
          fullState: state,
        });

        // Handle sync if enabled and value is defined
        if (value !== undefined) {
          console.log(`>>> Calling handleStateChange for ${id}, path: ${pathString}, value: ${value}`);
          this.handleStateChange(id, pathString, value);
        } else {
          console.log(`>>> Skipping handleStateChange - value is undefined`);
        }
      });

      // Attempt connection
      atemConnection.connect(ip);
      
      // Set a timeout for connection attempt
      const connectionTimeout = new Promise<void>((_, reject) => {
        setTimeout(() => {
          if (!device.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);
      });

      // Wait for connection or timeout
      await Promise.race([
        new Promise<void>((resolve) => {
          const checkConnection = setInterval(() => {
            if (device.connected) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 100);
          setTimeout(() => clearInterval(checkConnection), 5000);
        }),
        connectionTimeout,
      ]);
    } catch (error) {
      const device = this.devices.get(id);
      if (device) {
        device.connected = false;
        if (device.atemConnection) {
          device.atemConnection.disconnect();
        }
        this.emit('connection-change', id, false);
      }
      throw new Error(`Failed to connect to ATEM at ${ip}: ${(error as Error).message}`);
    }
  }

  private isValidIP(ip: string): boolean {
    const ipv4Regex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$|^localhost$|^127\.0\.0\.1$/;
    return ipv4Regex.test(ip);
  }

  async disconnect(id: string): Promise<void> {
    const device = this.devices.get(id);
    if (device) {
      device.connected = false;
      if (device.atemConnection) {
        device.atemConnection.disconnect();
      }
      this.logStateChange(id, device.ip, 'connection.disconnected', true, false);
      this.emit('connection-change', id, false);
      this.devices.delete(id);
    }
  }

  private logStateChange(deviceId: string, deviceIp: string, path: string, oldValue: any, newValue: any): void {
    const log: StateChangeLog = {
      timestamp: new Date().toISOString(),
      deviceId,
      deviceIp,
      path,
      oldValue,
      newValue,
    };

    this.stateChangeLogs.push(log);

    // Keep only the last N logs
    if (this.stateChangeLogs.length > this.maxLogs) {
      this.stateChangeLogs = this.stateChangeLogs.slice(-this.maxLogs);
    }

    console.log(`[${log.timestamp}] ATEM ${deviceId} (${deviceIp}) - ${path}: ${oldValue} → ${newValue}`);
    
    // Emit log event for UI to display
    this.emit('state-log', log);
  }

  getStateLogs(limit?: number): StateChangeLog[] {
    const logs = this.stateChangeLogs;
    if (limit) {
      return logs.slice(-limit);
    }
    return logs;
  }

  clearStateLogs(): void {
    this.stateChangeLogs = [];
  }

  private handleStateChange(sourceId: string, path: string, value: any): void {
    console.log(`\n=== handleStateChange ===`);
    console.log(`Source: ${sourceId}, Path: ${path}, Value: ${value}`);
    console.log(`Sync enabled: ${this.syncSettings.syncEnabled}`);
    
    if (!this.syncSettings.syncEnabled) {
      console.log(`Sync disabled, skipping`);
      return;
    }

    // Track program/preview inputs for CUT detection
    const sourceDevice = this.devices.get(sourceId);
    if (sourceDevice && path.includes('programInput')) {
      const oldProgram = sourceDevice.lastProgramInput;
      sourceDevice.lastProgramInput = value;
      
      // Detect CUT: program changed and the new program was the old preview
      // This means preview should now have the old program value
      if (oldProgram !== undefined && sourceDevice.lastPreviewInput === value) {
        console.log(`CUT detected! Program ${oldProgram} → ${value}, swapping preview ${value} → ${oldProgram}`);
        // Update our tracking
        sourceDevice.lastPreviewInput = oldProgram;
        // Also sync this preview change
        setTimeout(() => {
          this.syncPreviewChange(sourceId, oldProgram);
        }, 10);
      }
    } else if (sourceDevice && path.includes('previewInput')) {
      sourceDevice.lastPreviewInput = value;
    }

    // Filter state changes based on settings
    const pathLower = path.toLowerCase();
    const isInputChange = (pathLower.includes('input') || pathLower.includes('mixeffects')) && this.syncSettings.watchInputs;
    const isTransitionChange = pathLower.includes('transition') && this.syncSettings.watchTransitions;
    const isAudioChange = pathLower.includes('audio') && this.syncSettings.watchAudio;
    const isEffectChange = pathLower.includes('effect') && this.syncSettings.watchEffects;

    console.log(`Filters: input=${isInputChange}, transition=${isTransitionChange}, audio=${isAudioChange}, effect=${isEffectChange}`);

    const shouldProcess = isInputChange || isTransitionChange || isAudioChange || isEffectChange;
    if (!shouldProcess) {
      console.log(`Skipping sync for ${path} (not matching any watch filters)`);
      return;
    }

    // Determine sync direction
    let shouldSyncToRemote = false;
    let shouldSyncToLocal = false;

    if (sourceId === 'local' && this.syncSettings.localToRemote) {
      shouldSyncToRemote = true;
      console.log(`Local → Remote sync enabled`);
    } else if (sourceId !== 'local' && this.syncSettings.remoteToLocal) {
      shouldSyncToLocal = true;
      console.log(`Remote → Local sync enabled`);
    }

    console.log(`Sync directions: toRemote=${shouldSyncToRemote}, toLocal=${shouldSyncToLocal}`);

    // Apply changes to target devices
    if (shouldSyncToRemote) {
      console.log(`Syncing from local to all remote devices...`);
      this.devices.forEach((device, id) => {
        if (id !== sourceId && id !== 'local' && device.connected && device.atemConnection) {
          console.log(`  → Target: ${id}`);
          this.applySyncToDevice(device, path, value);
        }
      });
    }

    if (shouldSyncToLocal) {
      console.log(`Syncing from remote to local...`);
      const localDevice = this.devices.get('local');
      if (localDevice && localDevice.connected && localDevice.atemConnection) {
        console.log(`  → Target: local`);
        this.applySyncToDevice(localDevice, path, value);
      }
    }
    console.log(`======================\n`);
  }

  private syncPreviewChange(sourceId: string, previewValue: number): void {
    console.log(`\n=== Syncing CUT preview change ===`);
    console.log(`Source: ${sourceId}, Preview: ${previewValue}`);
    
    // Determine sync direction
    if (sourceId === 'local' && this.syncSettings.localToRemote) {
      this.devices.forEach((device, id) => {
        if (id !== sourceId && id !== 'local' && device.connected && device.atemConnection) {
          console.log(`  → Syncing preview ${previewValue} to ${id}`);
          device.atemConnection.changePreviewInput(previewValue, 0);
          device.lastPreviewInput = previewValue;
        }
      });
    } else if (sourceId !== 'local' && this.syncSettings.remoteToLocal) {
      const localDevice = this.devices.get('local');
      if (localDevice && localDevice.connected && localDevice.atemConnection) {
        console.log(`  → Syncing preview ${previewValue} to local`);
        localDevice.atemConnection.changePreviewInput(previewValue, 0);
        localDevice.lastPreviewInput = previewValue;
      }
    }
    console.log(`======================\n`);
  }

  private applySyncToDevice(device: ATEMDevice, path: string, value: any): void {
    // For transition positions, sync immediately without delay to keep T-bar in real-time sync
    const isTransitionPosition = path.includes('transitionPosition');
    const delay = isTransitionPosition ? 0 : this.syncSettings.syncDelay;
    
    // Apply state change with configured delay (or immediately for T-bar)
    setTimeout(() => {
      if (!device.atemConnection) return;

      // Parse the path to determine what command to send
      try {
        // Extract ME index if present
        const meMatch = path.match(/mixEffects\.(\d+)/);
        const meIndex = meMatch ? parseInt(meMatch[1], 10) : 0;

        // Extract upstream key index if present
        const uskMatch = path.match(/upstreamKeyers\.(\d+)/);
        const uskIndex = uskMatch ? parseInt(uskMatch[1], 10) : 0;

        // Extract downstream key index if present
        const dskMatch = path.match(/downstreamKeyers\.(\d+)/);
        const dskIndex = dskMatch ? parseInt(dskMatch[1], 10) : 0;

        // Program/Preview Inputs
        if (path.includes('programInput')) {
          const sourceDevice = this.devices.get(device.id);
          const oldPreview = sourceDevice?.lastPreviewInput;
          
          console.log(`Syncing programInput to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.changeProgramInput(value, meIndex);
          
          // If we have a previous preview value, swap it (simulates CUT behavior)
          // This happens when source ATEM does a CUT and only program changes
          if (oldPreview !== undefined && oldPreview !== value) {
            console.log(`Also syncing preview to maintain CUT behavior - setting preview to previous program`);
            // The preview on the target should become what was in program
            // But we need to get what was in program on the SOURCE, not target
            // We'll handle this in the state change handler instead
          }
        } 
        else if (path.includes('previewInput')) {
          console.log(`Syncing previewInput to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.changePreviewInput(value, meIndex);
          console.log(`Preview input change command sent successfully`);
        }
        
        // Transitions
        else if (path.includes('transitionPosition')) {
          // Extract handlePosition from the object
          const handlePosition = typeof value === 'object' && value?.handlePosition !== undefined 
            ? value.handlePosition 
            : value;
          console.log(`Syncing transitionPosition to ${handlePosition} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setTransitionPosition(handlePosition, meIndex);
        }
        else if (path.includes('transitionProperties.style')) {
          console.log(`Syncing transition style to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setTransitionStyle(value, meIndex);
        }
        else if (path.includes('transitionSettings.mix')) {
          console.log(`Syncing mix transition settings for ME ${meIndex} for device ${device.id}`);
          // Mix transition settings would need the full object
          if (typeof value === 'object') {
            device.atemConnection.setMixTransitionSettings(value, meIndex);
          }
        }
        else if (path.includes('transitionSettings.dip')) {
          console.log(`Syncing dip transition settings for ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setDipTransitionSettings(value, meIndex);
          }
        }
        else if (path.includes('transitionSettings.wipe')) {
          console.log(`Syncing wipe transition settings for ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setWipeTransitionSettings(value, meIndex);
          }
        }
        else if (path.includes('transitionSettings.DVE')) {
          console.log(`Syncing DVE transition settings for ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setDVETransitionSettings(value, meIndex);
          }
        }
        
        // Upstream Keyers (USK)
        else if (path.includes('upstreamKeyers') && path.includes('onAir')) {
          console.log(`Syncing USK ${uskIndex} onAir to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setUpstreamKeyerOnAir(value, meIndex, uskIndex);
        }
        else if (path.includes('upstreamKeyers') && path.includes('lumaSettings')) {
          console.log(`Syncing USK ${uskIndex} luma settings on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerLumaSettings(value, meIndex, uskIndex);
          }
        }
        else if (path.includes('upstreamKeyers') && path.includes('chromaSettings')) {
          console.log(`Syncing USK ${uskIndex} chroma settings on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerChromaSettings(value, meIndex, uskIndex);
          }
        }
        else if (path.includes('upstreamKeyers') && path.includes('fillSource')) {
          console.log(`Syncing USK ${uskIndex} fill source to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setUpstreamKeyerFillSource(value, meIndex, uskIndex);
        }
        else if (path.includes('upstreamKeyers') && path.includes('cutSource')) {
          console.log(`Syncing USK ${uskIndex} cut source to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setUpstreamKeyerCutSource(value, meIndex, uskIndex);
        }
        
        // Downstream Keyers (DSK)
        else if (path.includes('downstreamKeyers') && path.includes('onAir')) {
          console.log(`Syncing DSK ${dskIndex} onAir to ${value} for device ${device.id}`);
          device.atemConnection.setDownstreamKeyOnAir(value, dskIndex);
        }
        else if (path.includes('downstreamKeyers') && path.includes('tie')) {
          console.log(`Syncing DSK ${dskIndex} tie to ${value} for device ${device.id}`);
          device.atemConnection.setDownstreamKeyTie(value, dskIndex);
        }
        else if (path.includes('downstreamKeyers') && path.includes('fillSource')) {
          console.log(`Syncing DSK ${dskIndex} fill source to ${value} for device ${device.id}`);
          device.atemConnection.setDownstreamKeyFillSource(value, dskIndex);
        }
        else if (path.includes('downstreamKeyers') && path.includes('cutSource')) {
          console.log(`Syncing DSK ${dskIndex} cut source to ${value} for device ${device.id}`);
          device.atemConnection.setDownstreamKeyCutSource(value, dskIndex);
        }
        
        // Fade to Black
        else if (path.includes('fadeToBlack') && path.includes('isFullyBlack')) {
          console.log(`Syncing fade to black state to ${value} on ME ${meIndex} for device ${device.id}`);
          if (value === true) {
            device.atemConnection.fadeToBlack(meIndex);
          }
        }
        
        // Audio
        else if (path.includes('audio.channels') && path.includes('gain')) {
          const channelMatch = path.match(/channels\.(\d+)/);
          if (channelMatch) {
            const channelIndex = parseInt(channelMatch[1], 10);
            console.log(`Syncing audio channel ${channelIndex} gain to ${value} for device ${device.id}`);
            // Audio sync requires specific ATEM library methods - needs implementation
            // device.atemConnection.setAudioMixerInputGain(channelIndex, value);
          }
        }
        else if (path.includes('audio.channels') && path.includes('balance')) {
          const channelMatch = path.match(/channels\.(\d+)/);
          if (channelMatch) {
            const channelIndex = parseInt(channelMatch[1], 10);
            console.log(`Syncing audio channel ${channelIndex} balance to ${value} for device ${device.id}`);
            // Audio sync requires specific ATEM library methods - needs implementation
            // device.atemConnection.setAudioMixerInputBalance(channelIndex, value);
          }
        }
        else if (path.includes('audio.channels') && path.includes('mixOption')) {
          const channelMatch = path.match(/channels\.(\d+)/);
          if (channelMatch) {
            const channelIndex = parseInt(channelMatch[1], 10);
            console.log(`Syncing audio channel ${channelIndex} mix option to ${value} for device ${device.id}`);
            // Audio sync requires specific ATEM library methods - needs implementation
            // device.atemConnection.setAudioMixerInputMixOption(channelIndex, value);
          }
        }
        
        else {
          console.log(`Unknown sync path: ${path} = ${value}`);
        }
        
        console.log(`✓ Synced ${path} = ${value} to device ${device.id}`);
      } catch (error) {
        console.error(`✗ Failed to sync ${path} to device ${device.id}:`, error);
      }
    }, this.syncSettings.syncDelay);
  }

  setSyncSettings(settings: Partial<SyncSettings>): void {
    this.syncSettings = { ...this.syncSettings, ...settings };
  }

  getStatus() {
    const status: any = {};
    this.devices.forEach((device, id) => {
      status[id] = {
        connected: device.connected,
        ip: device.ip,
        lastState: device.lastState,
      };
    });
    return status;
  }
}
