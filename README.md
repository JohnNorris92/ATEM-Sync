# ATEM Sync Manager

A cross-platform Electron application for synchronizing multiple ATEM switchers in real-time.

## Features

- **Multi-ATEM Support**: Connect and sync unlimited ATEM switchers
- **Bidirectional Sync**: Sync in both directions or one-way only
- **Flexible Configuration**: Choose what events to sync (inputs, transitions, audio, effects)
- **Real-time Monitorinzg**: Live connection status and event logging
- **Configurable Delays**: Fine-tune sync timing for different network conditions

## Project Structure

```
src/
├── electron/          # Electron main process
│   ├── main.ts       # App entry point
│   ├── preload.ts    # IPC bridge
│   └── atemManager.ts # ATEM connection logic
├── react/            # React UI
│   ├── App.tsx
│   ├── App.css
│   ├── index.tsx
│   └── components/   # React components
└── shared/           # Shared types
    └── types.ts
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Building

```bash
npm run build
npm run dist
```

## License

MIT
