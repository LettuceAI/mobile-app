<div align="center">

<img src="https://github.com/LettuceAI/.github/blob/main/profile/LettuceAI-banner.png" alt="LettuceAI Banner" />

**A Private, Cross-Platform AI Roleplay App**
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--v3-blue)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

[Features](#features) • [Installation](#installation) • [Development](#development) • [Contributing](#contributing)

</div>

## Overview

**LettuceAI** is a sleek, privacy-first AI roleplay application built with Tauri v2, React, and TypeScript. It gives you a modern, mobile-first experience for creating characters, writing stories, and chatting with AI models, entirely on your own device. You bring your own API keys and choose which models to use.

**Our focus:** privacy, customization, and creative freedom so your stories stay yours.

## Community

Join our Discord for support, updates, and discussion:  
[![Discord](https://img.shields.io/badge/Discord-745bEttw2r-blue?logo=discord)](https://discord.gg/745bEttw2r)


## Technology Stack

* **Frontend:** React 18, TypeScript 5, Tailwind CSS v4, Framer Motion, Lucide React, Zod
* **Backend:** Tauri v2 (Rust), Keyring, custom Tauri commands

## Quick Start

### Prerequisites

* Node.js 18+ & npm
* Rust 1.70+ & Cargo
* Android SDK (for Android builds, optional)
  * Install [Android Studio](https://developer.android.com/studio) and set up the SDK
  * Ensure `ANDROID_SDK_ROOT` is set in your environment variables
  * Add platform tools to your `PATH` (e.g., `export PATH=$ANDROID_SDK_ROOT/platform-tools:$PATH`)

### Installation

```bash
# Clone the repository
git clone https://github.com/LettuceAI/mobile-app.git
cd lettuceai

# Install dependencies
npm install

# Run development server (web view)
npm run dev

# Run Tauri app (native desktop)
npm run tauri android dev

# Build for production
npm run tauri android build
```

### Android Development

```bash
# Ensure ANDROID_SDK_ROOT is set to your Android SDK path

# Run on Android emulator
npm run tauri android dev

# Build Android APK
npm run tauri android dev
```

---

## Using LettuceAI

### Providers

1. Open Settings → Providers
2. Add a provider (OpenAI, Anthropic, OpenRouter, local/custom)
3. Paste your API key (stored securely in the OS keychain)
4. Optionally set base URL & default model
5. Test connection without sending conversation content

### Chat

1. Open the chat interface
2. Select your provider and model
3. (Optional) Add custom system prompts
4. Start roleplaying — responses stream in real time

### Characters

* Name & identity
* Personality traits and style
* Boundaries and content guidelines

---

## Project Structure

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

---

## Development Commands

```bash
npm run dev         # Hot reload (web view)
npm run tauri dev   # Native app dev
npx tsc --noEmit    # Type check
npm run lint        # ESLint
npm run format      # Prettier
npm run build       # Production build
```

---

## Roadmap

* [x] Enhanced chat controls
* [x] Character and persona library
* [x] Custom system prompts
* [x] Extensive parameter support
* [ ] Built-in guides for character creation
* [x] Fully customizable defaults
* [ ] Multi-character conversations
* [x] Import chats and characters from SillyTavern and similar platforms
* [x] Export/Import data
* [ ] iOS support

---

## Contributing

We welcome contributions!

1. Fork the repo
2. Create a feature branch `git checkout -b feature/amazing-feature`
3. Follow TypeScript & React best practices
4. Test thoroughly
5. Commit with meaningful messages
6. Push and open a PR

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE)


</div>
  <p>Made with ❤️ for the AI community</p>
  <p><strong>Privacy-first • Local-first • Open Source</strong></p>
</div>
