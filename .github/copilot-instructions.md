# ATEM Sync Project Setup Instructions

## Project Overview
This is an Electron + React application for synchronizing multiple ATEM switchers in real-time.

### Architecture
- **Main Process**: Electron + Node.js (TypeScript) - handles ATEM connections and IPC
- **Renderer Process**: React 18 + TypeScript - UI
- **Shared Types**: TypeScript types for type safety

### Key Features
- Support for unlimited ATEM devices (1 local + multiple remotes)
- Bidirectional sync with configurable direction toggles
- Selective event watching (inputs, transitions, audio, effects)
- Configurable sync delays
- Real-time status monitoring

## Project Structure
```
src/
├── electron/           # Main process
│   ├── main.ts        # Electron app entry
│   ├── preload.ts     # IPC bridge
│   └── atemManager.ts # ATEM logic
├── react/             # Renderer (UI)
│   ├── App.tsx
│   ├── App.css
│   └── components/
└── shared/            # Shared types
```

## Dependencies
- `atem-connection`: ATEM protocol library
- `electron`: Desktop framework
- `react`: UI framework
- `zustand`: State management
- `electron-store`: Persistent storage

## Scripts
- `npm run dev`: Start development server
- `npm run build`: Build React + Electron
- `npm run dist`: Create distributable package
- `npm test`: Run tests

## Development Notes
- IPC communication between main and renderer via Electron preload
- ATEM state changes monitored and synced based on settings
- Multi-ATEM support through device ID mapping
- Sync direction configurable per direction (L→R, R→L)

## Next Steps (from plan)
1. ✓ Set up Electron + Node project structure
2. Build UI with connection panels and sync settings
3. Integrate ATEM discovery
4. Implement bidirectional sync engine
5. Add error handling and reconnection
6. Persist settings to disk
7. End-to-end testing
8. Package for distribution
