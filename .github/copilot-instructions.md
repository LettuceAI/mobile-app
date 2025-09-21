# LettuceAI Copilot Instructions

## Project Overview
LettuceAI is a cross-platform AI roleplay application built with **Tauri v2** (Rust backend) and **React 18** (TypeScript frontend). The app provides secure, local-first AI chat experiences with multiple provider support (OpenAI, Anthropic, custom endpoints).

## Architecture & Key Concepts

### Core Module Structure
- **`src/core/`** - Business logic layer (provider management, storage, chat functionality)
- **`src/ui/`** - React components and pages
- **`src-tauri/`** - Rust backend with custom file system and secure credential storage

### Provider System (`src/core/providers/`)
The app uses a **modular provider architecture**:
- `types.ts` - Core interfaces (`Provider`, `ProviderConfig`, `ChatParams`)
- `registry.ts` - Provider registration with defaults
- `manager.ts` - `ProviderManager` class handles credentials and model caching
- Individual providers: `openai.ts`, `anthropic.ts`, `custom.ts`

**Key Pattern**: All providers implement the same `Provider` interface with `listModels()` and `chat()` methods. The `chat()` method supports streaming via callbacks.

### Storage Layer (`src/core/storage/`)
- **`schemas.ts`** - Zod schemas for all data types (Sessions, Characters, Settings, etc.)
- **`repo.ts`** - High-level data operations (CRUD for characters, sessions, settings)
- **`files.ts`** - Low-level file I/O using Tauri commands
- **Local-first**: All data stored in app data directory via custom Rust commands

### Security & Credentials (`src/core/secrets/`)
- API keys stored via **custom Rust commands** (not OS keyring - uses JSON file with memory zeroing)
- `SecretRef` pattern: credentials referenced by `{providerId, credId, key}` tuples
- Never store credentials in React state; fetch on-demand

## Development Patterns

### Component Structure
- **Functional components** with hooks only
- **Framer Motion** for animations (see `TopNav.tsx` for motion patterns)
- **Mobile-first responsive design** with Tailwind CSS v4
- **Safe area insets** handled in layout components: `paddingTop: "calc(env(safe-area-inset-top) + 8px)"`

### Type Safety
- **Strict TypeScript** with all compiler strict flags enabled
- **Zod schemas** for runtime validation of all stored data
- **Provider configs** typed and validated at boundaries

### State Management
- **React Router** for navigation
- **Local state** with `useState`/`useEffect` - no global state library
- **Data loading** pattern: `async` functions in components with loading states

## Key Development Commands

```bash
# Development
npm run dev                    # Vite dev server (web preview)
npm run tauri dev             # Full Tauri app with Rust backend

# Production builds
npm run build                 # TypeScript compilation + Vite build
npm run tauri build          # Native desktop app

# Android (requires Android SDK setup)
npm run tauri -- android dev    # Android emulator
npm run tauri -- android build  # APK build
```

## Integration Points

### Tauri Commands (Rust ↔ TypeScript)
Custom file system operations defined in `src-tauri/src/lib.rs`:
- `ensure_data_dir()`, `read_app_file()`, `write_app_file()`
- `secret_for_cred_get/set/delete()` for credential management
- **No Tauri filesystem plugin** - uses custom commands for reliability

### Streaming Chat Implementation
Real-time streaming uses fetch with `ReadableStream`:
```typescript
// Pattern in provider implementations
const response = await fetch(url, { body: JSON.stringify(data) });
const reader = response.body?.getReader();
// Process SSE deltas and call onDelta callback
```

### Provider Extension Pattern
To add new AI providers:
1. Implement `Provider` interface in `src/core/providers/newprovider.ts`
2. Register in `providerRegistry` array in `registry.ts`
3. Add UI configuration in Settings pages

## File System Organization

### Data Storage
- **Characters**: `{appDataDir}/lettuce/characters.json`
- **Sessions**: `{appDataDir}/lettuce/sessions/{sessionId}.json`
- **Settings**: `{appDataDir}/lettuce/settings.json`
- **Secrets**: `{appDataDir}/lettuce/secrets.json` (encrypted in memory)

### UI Component Structure
- `ui/components/` - Reusable components with `index.ts` barrel exports
- `ui/pages/` - Route components organized by feature (chats, settings, onboarding)
- Mobile-first component design with bottom sheet patterns

## Common Patterns

### Error Handling
- **Provider errors**: Wrapped in try/catch with user-friendly messages
- **Storage errors**: Graceful fallbacks to empty/default data
- **Network errors**: AbortSignal support for request cancellation

### UUID Generation
Custom UUID implementation in `repo.ts` as fallback for environments without `crypto.randomUUID()`

### Model Caching
Provider models cached in `modelsCache.ts` with TTL (6 hours) to reduce API calls

## Security Considerations
- **HTTPS-only** endpoints (except localhost for development)
- **No telemetry** or data collection
- **Sandboxed Tauri** environment with minimal capabilities
- **Memory zeroing** for credential values after use