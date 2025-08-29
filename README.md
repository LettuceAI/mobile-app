# LettuceAI

<div align="center">

![LettuceAI Logo](src-tauri/icons/icon.png)

**A Modern Cross-Platform AI Roleplay Application**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

[Features](#features) • [Installation](#installation) • [Development](#development) • [Contributing](#contributing)

</div>

## Overview

LettuceAI is a sleek, cross-platform AI roleplay application built with Tauri v2, React, and TypeScript. It provides a modern, mobile-first interface for engaging conversations with AI characters through multiple provider integrations including OpenAI, Anthropic, and custom endpoints.

**Core Principles**: Privacy-first design, bring-your-own credentials, local-first persistence, modular providers, and secure keychain storage.

## Features

### 🤖 **Multi-Provider AI Support**
- **OpenAI Integration**: GPT-4, GPT-3.5-turbo, and other OpenAI models
- **Anthropic Integration**: Claude models with native streaming
- **Custom Providers**: Support for OpenRouter, local models, and custom endpoints
- **Provider Management**: Easy credential management with secure OS keychain storage

### 💬 **Advanced Chat Experience**
- **Real-time Streaming**: Token-by-token streaming responses with visual typing indicators
- **Character Roleplay**: Create and manage AI characters with custom personas
- **Session Management**: Persistent chat sessions with message history
- **System Prompts**: Customizable system instructions for character behavior

### 🎨 **Modern UI/UX**
- **Mobile-First Design**: Optimized for touch devices and small screens
- **Smooth Animations**: Powered by Framer Motion for fluid interactions
- **Clean Interface**: Full-height chat UI with bottom sheet settings
- **Responsive Layout**: Works seamlessly on desktop, tablet, and mobile

### 🔒 **Security & Privacy**
- **No Telemetry**: Zero user data collection or tracking
- **Encrypted Storage**: API keys stored securely in OS keychain via Rust `keyring`
- **Local-First**: All data stored locally on your device
- **HTTPS Only**: Secure communication with AI providers (or localhost for development)

### 🚀 **Technical Features**
- **Cross-Platform**: Desktop (Windows, macOS, Linux) and Android support
- **Custom File System**: Robust file operations without external plugins
- **Type Safety**: Full TypeScript implementation with Zod validation
- **Modular Architecture**: Clean separation of concerns and extensible design

## Technology Stack

### Frontend
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development with strict mode
- **Tailwind CSS v4** - Utility-first styling with custom design system
- **Framer Motion** - Smooth animations and transitions
- **Lucide React** - Beautiful and consistent iconography
- **Zod** - Runtime type validation and schema management

### Backend
- **Tauri v2** - Secure and lightweight desktop app framework
- **Rust** - High-performance systems programming language
- **Keyring** - Secure credential storage using OS keyring
- **Custom Commands** - Direct file system operations without plugins

## Quick Start

### Prerequisites
- **Node.js** 18+ and npm
- **Rust** 1.70+ with cargo
- **Android SDK** (for Android builds, optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lettuceai.git
cd lettuceai

# Install dependencies
npm install

# Run development server (web view)
npm run dev

# Run Tauri app (native desktop)
npm run tauri dev

# Build for production
npm run tauri build
```

### Android Development

```bash
# Setup Android development environment
# Ensure ANDROID_SDK_ROOT is set to your Android SDK path

# Run on Android emulator
npm run tauri:android

# Build Android APK
npm run tauri -- android build
```

## Configuration

### Provider Setup

1. **Open Settings** → Navigate to Settings → Providers
2. **Add Provider** → Choose from:
   - OpenAI (GPT-4, GPT-3.5-turbo)
   - Anthropic (Claude models)
   - OpenRouter (Multiple model access)
   - OpenAI-Compatible (Local models, custom endpoints)
   - Custom JSON (Advanced configurations)
3. **API Key** → Paste your API key (stored securely in OS keychain)
4. **Configuration** → Optionally set base URL and default model
5. **Test Connection** → Use Quick Test to validate (no conversation content sent)

### Chat Usage

1. **Navigate to Chat** → Open the chat interface
2. **Select Provider** → Choose your configured provider
3. **Set Model** → Pick the specific AI model
4. **System Prompt** → Add custom instructions (optional)
5. **Start Messaging** → Begin your conversation with real-time streaming

### Character Creation

Create AI characters with:
- **Name & Identity**: Character name and background
- **Persona**: Personality traits and characteristics
- **Communication Style**: How the character speaks and behaves
- **Boundaries**: Content guidelines and limitations

## Development

### Project Structure

```
src/
├── core/                    # Core business logic
│   ├── chat/               # Chat functionality and streaming
│   ├── providers/          # AI provider integrations (OpenAI, Anthropic, Custom)
│   ├── storage/            # Data persistence and file operations
│   └── secrets/            # Secure credential management
├── ui/                     # User interface components
│   ├── pages/              # Main pages (Chat, Settings)
│   └── components/         # Reusable UI components
└── assets/                 # Static assets and resources

src-tauri/
├── src/                    # Rust backend code
│   ├── lib.rs             # Custom file system commands
│   └── main.rs            # Application entry point
├── capabilities/           # Tauri security capabilities
└── icons/                  # Application icons
```

### Development Commands

```bash
# Development server with hot reload
npm run dev

# Tauri development (native app)
npm run tauri dev

# Type checking
npx tsc --noEmit

# Linting (TypeScript strict + ESLint)
npm run lint

# Code formatting (Prettier)
npm run format

# Build for production
npm run build
```

### Code Quality

**Husky Setup** (optional):
```bash
npx husky install
# Adds pre-commit hooks for lint-staged
```

**Linting & Formatting**:
- TypeScript strict mode enabled
- ESLint for code quality
- Prettier for consistent formatting
- Lint-staged for pre-commit quality gates

### Adding New Providers

1. **Create Provider File**: Add new provider in `src/core/providers/`
2. **Implement Interface**: Follow the `Provider` interface specification
3. **Register Provider**: Add to `src/core/providers/registry.ts`
4. **UI Integration**: Add provider configuration in Settings

Example provider implementation:
```typescript
import { Provider } from './types';

export const myProvider: Provider = {
  info: { id: 'my-provider', name: 'My Provider' },
  async listModels(config) {
    // Fetch available models
  },
  async chat(config, params, callbacks) {
    // Implement chat with streaming support
  }
};
```

## Security Notes

LettuceAI prioritizes security and privacy:

- **No Data Collection**: Zero telemetry or user tracking
- **Secure Storage**: API keys never stored in plaintext
- **OS Keychain**: Credentials stored via Rust `keyring` through Tauri commands
- **Local Data**: All conversations and settings stored locally
- **Encrypted Transit**: HTTPS-only communication (or localhost for development)
- **Sandboxed**: Tauri security model protects system resources
- **Minimal Permissions**: Only required capabilities enabled

**Network Security**:
- Only HTTPS endpoints allowed (except localhost for development)
- Network requests go directly to configured AI provider endpoints
- No proxy servers or intermediary services
- Certificate validation enforced

## Architecture

### Streaming Implementation

Real-time streaming uses Server-Sent Events (SSE) with delta updates:

```typescript
// Streaming callback in chat
onDelta: (delta: string) => {
  streamedContent += delta;
  setMessages(prev => prev.map((msg, idx) => 
    idx === prev.length - 1 ? { ...msg, content: streamedContent } : msg
  ));
}
```

### File System

Custom Rust commands replace Tauri plugins for reliability:

```rust
#[tauri::command]
async fn ensure_data_dir() -> Result<String, String> {
    // Custom file system operations
}
```

### Provider System

Modular provider architecture supports multiple AI services:

```typescript
interface Provider {
  info: ProviderInfo;
  listModels(config: ProviderConfig): Promise<string[]>;
  chat(config: ProviderConfig, params: ChatParams, callbacks?: ChatCallbacks): Promise<ChatResponse>;
}
```

## Roadmap

- [ ] **iOS Support** - Native iOS application
- [ ] **Voice Integration** - Speech-to-text and text-to-speech
- [ ] **Plugin System** - Third-party extensions
- [ ] **Multi-Character Chats** - Group conversations
- [ ] **Advanced Characters** - More detailed character creation
- [ ] **Export/Import** - Data portability features
- [ ] **Themes** - Custom UI themes and layouts

## Contributing

We welcome contributions! Please:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Follow** TypeScript and React best practices
4. **Test** your changes thoroughly
5. **Commit** with meaningful messages
6. **Push** to your branch: `git push origin feature/amazing-feature`
7. **Open** a Pull Request

### Code Style Guidelines

- Use functional components with hooks
- Implement proper error handling
- Add TypeScript types for all interfaces
- Follow the existing project structure
- Write clear, descriptive commit messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - Amazing desktop app framework
- [React](https://reactjs.org/) - Powerful UI library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Lucide](https://lucide.dev/) - Beautiful icon set
- [Framer Motion](https://www.framer.com/motion/) - Smooth animations

---

<div align="center">
  <p>Made with ❤️ for the AI community</p>
  <p><strong>Privacy-first • Local-first • Open Source</strong></p>
</div>
