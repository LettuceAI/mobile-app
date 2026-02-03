<div align="center">
  <img src="https://github.com/LettuceAI/.github/blob/main/profile/LettuceAI-banner.png" alt="LettuceAI Banner" />
  
  # LettuceAI
  
  **Official application repository for LettuceAI**
  
  [Overview](#overview) • [Install](#install) • [Development](#development) • [Android](#android) • [Contributing](#contributing)
</div>

## Overview

This repository contains the LettuceAI application. LettuceAI is a privacy-first, cross‑platform roleplay and storytelling app built with Tauri v2, React, and TypeScript. It runs locally, keeps data on‑device, and lets users bring their own API keys and models.

## Install

### Prerequisites

- Bun 1.1+ (includes Node.js compatibility): https://bun.sh/
- Rust 1.70+ and Cargo
- Android SDK (optional, for Android builds)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/LettuceAI/mobile-app.git
cd mobile-app

# Install dependencies
bun install

# Run web dev server
bun run dev

# Run Tauri desktop app
bun run tauri dev
```

## Development

### Common Commands

```bash
# Web
bun run dev
bun run build

# Desktop (Tauri)
bun run tauri dev
bun run tauri build

# Android
bun run tauri android dev
bun run tauri android build

# Quality
bunx tsc --noEmit
bun run format
```

### Project Layout

```
src/
  core/        # Chat logic, providers, storage, secure creds
  ui/          # Pages and reusable components
  assets/      # Static assets and resources

src-tauri/
  src/         # Rust backend (custom commands, entry point)
  capabilities/
  icons/
```

## Android

### Setup

- Install Android Studio and set up the SDK
- Ensure `ANDROID_SDK_ROOT` is set in your environment
- Add platform tools to your `PATH` (example: `export PATH=$ANDROID_SDK_ROOT/platform-tools:$PATH`)

### Build and Run

```bash
# Run on Android emulator
bun run tauri android dev

# Build Android APK
bun run tauri android build
```

## Contributing

We welcome contributions.

1. Fork the repo
2. Create a feature branch `git checkout -b feature/my-change`
3. Follow TypeScript and React best practices
4. Test your changes
5. Commit with clear, conventional messages
6. Push and open a PR

## License

GNU Affero General Public License v3.0 — see `LICENSE`

<div align="center">
  <p>Privacy-first • Local-first • Open Source</p>
</div>
