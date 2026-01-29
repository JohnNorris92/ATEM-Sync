# ATEM Sync - Project Architecture & Design

## Overview
ATEM Sync is an Electron desktop application that enables real-time bidirectional synchronization of multiple ATEM video switchers.

## Multi-ATEM Support Architecture

### Connection Model
```
┌─────────────────────────────────────────────────────────┐
│                   LOCAL ATEM                             │
│              (Primary/Read/Source)                       │
│                                                           │
│  - Always connected first                                │
│  - Can be on any network (dynamic/static IP)             │
│  - Changes are watched and forwarded                     │
└─────────────────────────────────────────────────────────┘
                    ↓ ↑
                ┌───┴─────┐
                │ Sync    │
                │ Engine  │
                └───┬─────┘
                ↓   ↑
        ┌───────────────────┐
        │  REMOTE ATEMs     │
        │  (Unlimited)      │
        │                   │
        │ - Remote 1        │ ← Remote Location 1 (static WAN IP)
        │ - Remote 2        │ ← Remote Location 2 (dynamic IP)
        │ - Remote 3        │ ← Remote Location 3 (local network)
        │ - ...             │
        └───────────────────┘
```

### Configuration per ATEM
```javascript
{
  "devices": [
    {
      "id": "local",
      "ip": "192.168.1.100",
      "label": "Studio A - Local",
      "type": "local",
      "connected": true
    },
    {
      "id": "remote-1",
      "ip": "203.45.67.89",
      "label": "New York - Remote",
      "type": "remote",
      "connected": false,
      "staticWAN": true  // Helps with priority/reconnection
    },
    {
      "id": "remote-2",
      "ip": "192.168.2.50",
      "label": "London - Remote",
      "type": "remote",
      "connected": false,
      "staticWAN": false  // Dynamic IP
    }
  ]
}
```

## Bidirectional Sync with Direction Control

### Sync Direction Options

**1. Full Bidirectional (Default)**
```
Local ↔ Remote-1, Local ↔ Remote-2, Remote-1 ↔ Remote-2
```
All devices stay in sync, any change propagates to all.

**2. Hub & Spoke (Local Only Drives)**
```
Local → Remote-1
Local → Remote-2
Remote-1 ↛ Local (read-only)
Remote-2 ↛ Local (read-only)
```
Local is the master, remotes are slaves.

**3. Remote Backup Mode**
```
Remote → Local (one-way)
Local ↛ Remote (read-only)
```
Remote feeds into local for redundancy.

**4. Independent Monitoring**
```
All devices connected but sync disabled
Use for logging/monitoring only
```

### Per-Device Direction Configuration
```json
{
  "syncSettings": {
    "syncEnabled": true,
    
    // Global direction flags
    "localToRemote": true,      // Master → Slaves
    "remoteToLocal": true,      // Allow backfeeds
    
    // Watch specific events
    "watchInputs": true,
    "watchTransitions": true,
    "watchAudio": true,
    "watchEffects": true,
    
    // Timing
    "syncDelay": 50,            // milliseconds
    "retryAttempts": 3,
    "retryDelay": 1000
  },
  
  // Per-device overrides (future enhancement)
  "deviceSettings": {
    "remote-1": {
      "localToRemote": true,    // This remote receives from local
      "remoteToLocal": false,   // This remote doesn't feed local
      "syncDelay": 50
    }
  }
}
```

## Sync Event Flow

### Step 1: State Change Detection
```
ATEM Connection → State Change Event
                      ↓
                 [Event Details]
                 - Device ID
                 - Change Type (input, transition, etc)
                 - New Value
                 - Timestamp
```

### Step 2: Filter & Validate
```
[Event Details]
        ↓
[Check sync enabled?] → No → Discard
        ↓ Yes
[Check watch event type?] → No → Discard
        ↓ Yes
[Check direction allowed?] → No → Discard
        ↓ Yes
[Validate target device(s)] → Failed → Discard
        ↓ Success
[Pass to Command Queue]
```

### Step 3: Command Generation & Queuing
```
[Event + Settings]
        ↓
[Generate ATEM Command]
        ↓
[Add to Queue with Timestamp]
        ↓
[Apply Sync Delay]
        ↓
[Execute on Target Device(s)]
```

### Step 4: Error Handling
```
[Command Execution]
        ↓
[Success?] → Yes → Log, Continue
        ↓ No
[Retry Queue + Increment Counter]
        ↓
[Max Retries?] → Yes → Mark Failed, Alert User
        ↓ No
[Wait Retry Delay]
        ↓
[Retry Command]
```

## File Organization & IPC

### Main Process (Electron)
- **main.ts**: App lifecycle, window management, IPC setup
- **atemManager.ts**: Core sync logic, device management
- **preload.ts**: Secure IPC bridge to renderer

### Renderer Process (React)
- **App.tsx**: Main component, state management
- **ConnectionPanel.tsx**: IP input, connect/disconnect UI
- **SyncSettings.tsx**: Direction toggles, watch event checkboxes

### Shared
- **types.ts**: Interfaces for type safety across processes

### IPC Channels

**Invoke (Request-Response)**
```
connectATEM(id, ip)           → { success, error }
disconnectATEM(id)            → { success, error }
getATEMStatus()               → { devices status }
setSyncSettings(settings)     → { success }
```

**Listen (Events from Main)**
```
atem-state-change             → { id, state }
atem-connection-change        → { id, connected }
```

## Persistence & Settings

### Electron Store
Uses `electron-store` to persist:
- Device list and IPs
- Sync settings
- Last known state
- Connection history

Path: `~/.config/atem-sync/settings.json` (Linux/Mac) or AppData (Windows)

## Network Considerations

### Static WAN vs Dynamic IP
- **Static WAN**: Mark in config, prioritize for reconnection
- **Dynamic IP**: Use discovery/manual re-entry on reconnection
- **Local Network**: Use mDNS discovery when available

### Reconnection Strategy
```
Connection Lost
        ↓
[Wait 2 seconds]
        ↓
[Retry Connection] → Success → Resume sync
        ↓ Failed
[Increment Attempt Counter]
        ↓
[Max Attempts?] → Yes → Alert user, switch to manual
        ↓ No
[Exponential Backoff] (2s → 4s → 8s → 16s → max 60s)
        ↓
[Retry]
```

## Sync Filtering by Event Type

### Input Selection
- Source: ATEM input selected
- Sync: Program output bus assignment
- Conflict resolution: Last-write-wins + timestamp

### Transitions
- Source: Transition triggered (cut, mix, DVE, etc)
- Sync: Recreate transition on target
- Timing: Respect transition duration

### Audio
- Source: Audio level changes
- Sync: Audio fader position
- Filtering: Can filter by audio source

### Effects/DVE
- Source: Effect state changes
- Sync: Effect parameters
- Timing: Synchronize animation timing

## Future Enhancements
1. **ATEM Discovery**: Auto-discover switchers on network
2. **Presets**: Save/load sync configurations
3. **Event Logging**: Full audit trail of sync events
4. **Webhooks**: External integrations
5. **Web Interface**: Control app from browser
6. **Advanced Filtering**: Regex patterns for selective sync
7. **Scheduling**: Sync rules on time schedule
8. **Analytics**: Track sync performance metrics
