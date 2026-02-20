import { EventEmitter } from 'events';
import { Atem } from 'atem-connection';
import { VmixConnection } from './vmixConnection';

interface ATEMDevice {
  id: string;
  ip: string;
  connected: boolean;
  lastState: any;
  software: 'atem' | 'vmix';
  port: number;
  atemConnection?: Atem;
  vmixConnection?: VmixConnection;
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

export class ATEMConnectionManager extends EventEmitter {
  private devices: Map<string, ATEMDevice> = new Map();
  private stateChangeLogs: StateChangeLog[] = [];
  private maxLogs: number = 500; // Keep last 500 logs
  private syncSettings: SyncSettings = {
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
  };

  constructor() {
    super();
  }

  async connect(id: string, ip: string, software: 'atem' | 'vmix' = 'atem', port?: number): Promise<void> {
    const effectivePort = port ?? (software === 'vmix' ? 8099 : 9910);

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
        software,
        port: effectivePort,
      };

      this.devices.set(id, device);

      if (software === 'vmix') {
        await this.connectVmix(device);
      } else {
        await this.connectAtem(device);
      }
    } catch (error) {
      const device = this.devices.get(id);
      if (device) {
        device.connected = false;
        if (device.atemConnection) {
          device.atemConnection.disconnect();
        }
        if (device.vmixConnection) {
          device.vmixConnection.disconnect();
        }
        this.emit('connection-change', id, false);
      }
      throw new Error(`Failed to connect to ${software.toUpperCase()} at ${ip}: ${(error as Error).message}`);
    }
  }

  private async connectAtem(device: ATEMDevice): Promise<void> {
    const { id, ip } = device;

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
  }

  private async connectVmix(device: ATEMDevice): Promise<void> {
    const { id, ip, port } = device;

    const vmix = new VmixConnection();
    device.vmixConnection = vmix;

    vmix.on('connected', () => {
      console.log(`Connected to vMix ${id} at ${ip}:${port}`);
      this.logStateChange(id, ip, 'connection.connected', device.connected, true);
      device.connected = true;
      this.emit('connection-change', id, true);
    });

    vmix.on('disconnected', () => {
      console.log(`vMix ${id} disconnected`);
      this.logStateChange(id, ip, 'connection.disconnected', device.connected, false);
      device.connected = false;
      this.emit('connection-change', id, false);
    });

    vmix.on('error', (error: Error) => {
      console.error(`vMix ${id} error:`, error.message);
      this.logStateChange(id, ip, 'connection.error', device.connected, false);
      device.connected = false;
      this.emit('connection-change', id, false);
    });

    // When this vMix device is a master, forward program/preview changes as synthetic state changes
    vmix.on('programChange', (input: number) => {
      const path = 'video.mixEffects.0.programInput';
      this.logStateChange(id, ip, path, device.lastProgramInput, input);
      device.lastProgramInput = input;
      console.log(`vMix ${id} program changed to ${input}`);

      this.emit('state-change', {
        deviceId: id,
        deviceIp: ip,
        path,
        state: input,
        fullState: null,
      });

      this.handleStateChange(id, path, input);
    });

    vmix.on('previewChange', (input: number) => {
      const path = 'video.mixEffects.0.previewInput';
      this.logStateChange(id, ip, path, device.lastPreviewInput, input);
      device.lastPreviewInput = input;
      console.log(`vMix ${id} preview changed to ${input}`);

      this.emit('state-change', {
        deviceId: id,
        deviceIp: ip,
        path,
        state: input,
        fullState: null,
      });

      this.handleStateChange(id, path, input);
    });

    vmix.connect(ip, port);

    // Wait for connection or timeout
    const connectionTimeout = new Promise<void>((_, reject) => {
      setTimeout(() => {
        if (!device.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });

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
      if (device.vmixConnection) {
        device.vmixConnection.disconnect();
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
    const isInputChange = (pathLower.includes('programinput') || pathLower.includes('previewinput')) && this.syncSettings.watchInputs;
    const isTransitionChange = pathLower.includes('transition') && this.syncSettings.watchTransitions;
    const isAudioChange = (pathLower.includes('audio') || pathLower.includes('fairlight')) && this.syncSettings.watchAudio;
    const isEffectChange = (pathLower.includes('fadeToBlack') || pathLower.includes('ftb')) && this.syncSettings.watchEffects;
    const isKeyChange = (pathLower.includes('upstreamkeyer') || pathLower.includes('downstreamkeyer')) && this.syncSettings.watchKeys;
    const isAuxChange = pathLower.includes('aux') && this.syncSettings.watchAux;
    const isMacroChange = pathLower.includes('macro') && this.syncSettings.watchMacros;
    const isMediaPlayerChange = pathLower.includes('mediaplayer') && this.syncSettings.watchMediaPlayers;
    const isSuperSourceChange = pathLower.includes('supersource') && this.syncSettings.watchSuperSource;
    const isMultiviewerChange = pathLower.includes('multiviewer') && this.syncSettings.watchMultiviewer;
    const isColorGenChange = pathLower.includes('colorgenerator') && this.syncSettings.watchColorGenerators;
    const isStreamingChange = (pathLower.includes('streaming') || pathLower.includes('recording')) && this.syncSettings.watchStreaming;

    console.log(`Filters: input=${isInputChange}, transition=${isTransitionChange}, audio=${isAudioChange}, effect=${isEffectChange}, keys=${isKeyChange}, aux=${isAuxChange}`);

    const shouldProcess = isInputChange || isTransitionChange || isAudioChange || isEffectChange || 
                          isKeyChange || isAuxChange || isMacroChange || isMediaPlayerChange || 
                          isSuperSourceChange || isMultiviewerChange || isColorGenChange || isStreamingChange;
    if (!shouldProcess) {
      console.log(`Skipping sync for ${path} (not matching any watch filters)`);
      return;
    }

    // Only propagate changes from master to slaves
    if (sourceId !== 'master') {
      console.log(`Ignoring change from slave device ${sourceId}`);
      console.log(`======================\n`);
      return;
    }

    console.log(`Syncing from master to all slave devices...`);
    this.devices.forEach((device, id) => {
      if (id !== 'master' && device.connected) {
        if (device.software === 'vmix' && device.vmixConnection) {
          // vMix slaves only receive program/preview changes
          console.log(`  → Target (vMix): ${id}`);
          this.applySyncToVmixDevice(device, path, value);
        } else if (device.atemConnection) {
          console.log(`  → Target (ATEM): ${id}`);
          this.applySyncToDevice(device, path, value);
        }
      }
    });
    console.log(`======================\n`);
  }

  private syncPreviewChange(sourceId: string, previewValue: number): void {
    console.log(`\n=== Syncing CUT preview change ===`);
    console.log(`Source: ${sourceId}, Preview: ${previewValue}`);
    
    // Only propagate from master to slaves
    if (sourceId !== 'master') {
      console.log(`Ignoring preview change from slave device ${sourceId}`);
      console.log(`======================\n`);
      return;
    }

    this.devices.forEach((device, id) => {
      if (id !== 'master' && device.connected) {
        if (device.software === 'vmix' && device.vmixConnection) {
          console.log(`  → Syncing preview ${previewValue} to vMix ${id}`);
          device.vmixConnection.setPreview(previewValue);
          device.lastPreviewInput = previewValue;
        } else if (device.atemConnection) {
          console.log(`  → Syncing preview ${previewValue} to ATEM ${id}`);
          device.atemConnection.changePreviewInput(previewValue, 0);
          device.lastPreviewInput = previewValue;
        }
      }
    });
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

        // Extract aux bus index if present
        const auxMatch = path.match(/auxilliaries\.(\d+)/);
        const auxIndex = auxMatch ? parseInt(auxMatch[1], 10) : 0;

        // Extract media player index if present
        const mpMatch = path.match(/mediaPlayers\.(\d+)/);
        const mpIndex = mpMatch ? parseInt(mpMatch[1], 10) : 0;

        // Extract SuperSource box index if present
        const ssBoxMatch = path.match(/superSources\.(\d+)\.boxes\.(\d+)/);
        const ssIndex = ssBoxMatch ? parseInt(ssBoxMatch[1], 10) : 0;
        const ssBoxIndex = ssBoxMatch ? parseInt(ssBoxMatch[2], 10) : 0;

        // Extract multiviewer indices if present
        const mvMatch = path.match(/multiViewers\.(\d+)/);
        const mvIndex = mvMatch ? parseInt(mvMatch[1], 10) : 0;
        const mvWindowMatch = path.match(/windows\.(\d+)/);
        const mvWindowIndex = mvWindowMatch ? parseInt(mvWindowMatch[1], 10) : 0;

        // Extract color generator index if present
        const cgMatch = path.match(/colorGenerators\.(\d+)/);
        const cgIndex = cgMatch ? parseInt(cgMatch[1], 10) : 0;

        // ============================================
        // PROGRAM/PREVIEW INPUTS
        // ============================================
        if (path.includes('programInput')) {
          console.log(`Syncing programInput to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.changeProgramInput(value, meIndex);
        } 
        else if (path.includes('previewInput')) {
          console.log(`Syncing previewInput to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.changePreviewInput(value, meIndex);
        }

        // ============================================
        // TRANSITIONS
        // ============================================
        else if (path.includes('transitionPosition')) {
          const handlePosition = typeof value === 'object' && value?.handlePosition !== undefined 
            ? value.handlePosition 
            : value;
          console.log(`Syncing transitionPosition to ${handlePosition} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setTransitionPosition(handlePosition, meIndex);
        }
        else if (path.includes('transitionProperties')) {
          console.log(`Syncing transition properties on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setTransitionStyle(value, meIndex);
          }
        }
        else if (path.includes('transitionSettings.mix')) {
          console.log(`Syncing mix transition settings for ME ${meIndex} for device ${device.id}`);
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
        else if (path.includes('transitionSettings.stinger')) {
          console.log(`Syncing stinger transition settings for ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setStingerTransitionSettings(value, meIndex);
          }
        }

        // ============================================
        // UPSTREAM KEYERS (USK)
        // ============================================
        else if (path.includes('upstreamKeyers') && path.includes('onAir')) {
          console.log(`Syncing USK ${uskIndex} onAir to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setUpstreamKeyerOnAir(value, meIndex, uskIndex);
        }
        else if (path.includes('upstreamKeyers') && path.includes('mixEffectKeyType')) {
          console.log(`Syncing USK ${uskIndex} type settings on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerType(value, meIndex, uskIndex);
          }
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
        else if (path.includes('upstreamKeyers') && path.includes('advancedChromaSettings')) {
          console.log(`Syncing USK ${uskIndex} advanced chroma on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerAdvancedChromaProperties(value, meIndex, uskIndex);
          }
        }
        else if (path.includes('upstreamKeyers') && path.includes('patternSettings')) {
          console.log(`Syncing USK ${uskIndex} pattern settings on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerPatternSettings(value, meIndex, uskIndex);
          }
        }
        else if (path.includes('upstreamKeyers') && path.includes('dveSettings')) {
          console.log(`Syncing USK ${uskIndex} DVE settings on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerDVESettings(value, meIndex, uskIndex);
          }
        }
        else if (path.includes('upstreamKeyers') && path.includes('maskSettings')) {
          console.log(`Syncing USK ${uskIndex} mask settings on ME ${meIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setUpstreamKeyerMaskSettings(value, meIndex, uskIndex);
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

        // ============================================
        // DOWNSTREAM KEYERS (DSK)
        // ============================================
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
        else if (path.includes('downstreamKeyers') && path.includes('rate')) {
          console.log(`Syncing DSK ${dskIndex} rate to ${value} for device ${device.id}`);
          device.atemConnection.setDownstreamKeyRate(value, dskIndex);
        }
        else if (path.includes('downstreamKeyers') && path.includes('properties')) {
          console.log(`Syncing DSK ${dskIndex} properties for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setDownstreamKeyGeneralProperties(value, dskIndex);
          }
        }
        else if (path.includes('downstreamKeyers') && path.includes('mask')) {
          console.log(`Syncing DSK ${dskIndex} mask settings for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setDownstreamKeyMaskSettings(value, dskIndex);
          }
        }

        // ============================================
        // FADE TO BLACK
        // ============================================
        else if (path.includes('fadeToBlack') && path.includes('isFullyBlack')) {
          console.log(`Syncing fade to black state to ${value} on ME ${meIndex} for device ${device.id}`);
          if (value === true) {
            device.atemConnection.fadeToBlack(meIndex);
          }
        }
        else if (path.includes('fadeToBlack') && path.includes('rate')) {
          console.log(`Syncing fade to black rate to ${value} on ME ${meIndex} for device ${device.id}`);
          device.atemConnection.setFadeToBlackRate(value, meIndex);
        }

        // ============================================
        // AUX OUTPUTS
        // ============================================
        else if (path.includes('auxilliaries')) {
          console.log(`Syncing AUX ${auxIndex} source to ${value} for device ${device.id}`);
          device.atemConnection.setAuxSource(value, auxIndex);
        }

        // ============================================
        // MEDIA PLAYERS
        // ============================================
        else if (path.includes('mediaPlayers') && path.includes('source')) {
          console.log(`Syncing Media Player ${mpIndex} source for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setMediaPlayerSource(value, mpIndex);
          }
        }
        else if (path.includes('mediaPlayers') && !path.includes('source')) {
          console.log(`Syncing Media Player ${mpIndex} settings for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setMediaPlayerSettings(value, mpIndex);
          }
        }

        // ============================================
        // SUPERSOURCE
        // ============================================
        else if (path.includes('superSources') && path.includes('boxes')) {
          console.log(`Syncing SuperSource ${ssIndex} Box ${ssBoxIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setSuperSourceBoxSettings(value, ssBoxIndex, ssIndex);
          }
        }
        else if (path.includes('superSources') && path.includes('border')) {
          console.log(`Syncing SuperSource ${ssIndex} border for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setSuperSourceBorder(value, ssIndex);
          }
        }
        else if (path.includes('superSources') && path.includes('properties')) {
          console.log(`Syncing SuperSource ${ssIndex} properties for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setSuperSourceProperties(value, ssIndex);
          }
        }

        // ============================================
        // MULTIVIEWER
        // ============================================
        else if (path.includes('multiViewers') && path.includes('windows') && path.includes('source')) {
          console.log(`Syncing MultiViewer ${mvIndex} Window ${mvWindowIndex} source to ${value} for device ${device.id}`);
          device.atemConnection.setMultiViewerWindowSource(value, mvIndex, mvWindowIndex);
        }
        else if (path.includes('multiViewers') && path.includes('windows') && path.includes('safeArea')) {
          console.log(`Syncing MultiViewer ${mvIndex} Window ${mvWindowIndex} safe area for device ${device.id}`);
          device.atemConnection.setMultiViewerWindowSafeAreaEnabled(value, mvIndex, mvWindowIndex);
        }
        else if (path.includes('multiViewers') && path.includes('windows') && path.includes('vuMeter')) {
          console.log(`Syncing MultiViewer ${mvIndex} Window ${mvWindowIndex} VU meter for device ${device.id}`);
          device.atemConnection.setMultiViewerWindowVuEnabled(value, mvIndex, mvWindowIndex);
        }
        else if (path.includes('multiViewers') && path.includes('properties')) {
          console.log(`Syncing MultiViewer ${mvIndex} properties for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setMultiViewerProperties(value, mvIndex);
          }
        }
        else if (path.includes('multiViewers') && path.includes('vuOpacity')) {
          console.log(`Syncing MultiViewer ${mvIndex} VU opacity to ${value} for device ${device.id}`);
          device.atemConnection.setMultiViewerVuOpacity(value, mvIndex);
        }

        // ============================================
        // COLOR GENERATORS
        // ============================================
        else if (path.includes('colorGenerators')) {
          console.log(`Syncing Color Generator ${cgIndex} for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setColorGeneratorColour(value, cgIndex);
          }
        }

        // ============================================
        // MACROS
        // ============================================
        else if (path.includes('macro') && path.includes('isRunning') && value === true) {
          const macroMatch = path.match(/macroPlayer\.macroIndex/);
          console.log(`Macro triggered - syncing macro run for device ${device.id}`);
          // Macro index would need to be extracted from state
        }
        else if (path.includes('macro') && path.includes('loop')) {
          console.log(`Syncing macro loop setting to ${value} for device ${device.id}`);
          device.atemConnection.macroSetLoop(value);
        }

        // ============================================
        // CLASSIC AUDIO MIXER
        // ============================================
        else if (path.includes('audio.channels')) {
          const channelMatch = path.match(/channels\.(\d+)/);
          if (channelMatch) {
            const channelIndex = parseInt(channelMatch[1], 10);
            console.log(`Syncing audio channel ${channelIndex} settings for device ${device.id}`);
            if (typeof value === 'object') {
              device.atemConnection.setClassicAudioMixerInputProps(channelIndex, value);
            }
          }
        }
        else if (path.includes('audio.master')) {
          console.log(`Syncing audio master settings for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setClassicAudioMixerMasterProps(value);
          }
        }
        else if (path.includes('audio.monitor')) {
          console.log(`Syncing audio monitor settings for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setClassicAudioMixerMonitorProps(value);
          }
        }

        // ============================================
        // FAIRLIGHT AUDIO
        // ============================================
        else if (path.includes('fairlight') && path.includes('inputs')) {
          const flInputMatch = path.match(/inputs\.(\d+)/);
          if (flInputMatch) {
            const inputIndex = parseInt(flInputMatch[1], 10);
            if (path.includes('sources')) {
              const sourceMatch = path.match(/sources\.([\w-]+)/);
              if (sourceMatch) {
                const sourceId = sourceMatch[1];
                console.log(`Syncing Fairlight input ${inputIndex} source ${sourceId} for device ${device.id}`);
                if (typeof value === 'object') {
                  device.atemConnection.setFairlightAudioMixerSourceProps(inputIndex, sourceId, value);
                }
              }
            } else {
              console.log(`Syncing Fairlight input ${inputIndex} for device ${device.id}`);
              if (typeof value === 'object') {
                device.atemConnection.setFairlightAudioMixerInputProps(inputIndex, value);
              }
            }
          }
        }
        else if (path.includes('fairlight') && path.includes('master')) {
          console.log(`Syncing Fairlight master settings for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setFairlightAudioMixerMasterProps(value);
          }
        }
        else if (path.includes('fairlight') && path.includes('monitor')) {
          console.log(`Syncing Fairlight monitor settings for device ${device.id}`);
          if (typeof value === 'object') {
            device.atemConnection.setFairlightAudioMixerMonitorProps(value);
          }
        }

        // ============================================
        // INPUT SETTINGS
        // ============================================
        else if (path.includes('inputs') && (path.includes('shortName') || path.includes('longName'))) {
          const inputMatch = path.match(/inputs\.(\d+)/);
          if (inputMatch) {
            const inputIndex = parseInt(inputMatch[1], 10);
            console.log(`Syncing input ${inputIndex} settings for device ${device.id}`);
            if (typeof value === 'object') {
              device.atemConnection.setInputSettings(value, inputIndex);
            }
          }
        }

        else {
          console.log(`Unknown sync path: ${path} = ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
        
        console.log(`✓ Synced ${path} to device ${device.id}`);
      } catch (error) {
        console.error(`✗ Failed to sync ${path} to device ${device.id}:`, error);
      }
    }, delay);
  }

  private applySyncToVmixDevice(device: ATEMDevice, path: string, value: any): void {
    if (!device.vmixConnection) return;

    const delay = this.syncSettings.syncDelay;

    setTimeout(() => {
      if (!device.vmixConnection) return;

      try {
        if (path.includes('programInput')) {
          console.log(`Syncing programInput to ${value} on vMix device ${device.id}`);
          device.vmixConnection.setProgram(value);
        } else if (path.includes('previewInput')) {
          console.log(`Syncing previewInput to ${value} on vMix device ${device.id}`);
          device.vmixConnection.setPreview(value);
        } else {
          console.log(`Skipping non-input sync path for vMix: ${path}`);
          return;
        }

        console.log(`✓ Synced ${path} to vMix device ${device.id}`);
      } catch (error) {
        console.error(`✗ Failed to sync ${path} to vMix device ${device.id}:`, error);
      }
    }, delay);
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
