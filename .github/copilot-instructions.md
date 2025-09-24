# LettuceAI Copilot Instructions

## Project Overview
LettuceAI is a cross-platform AI roleplay application built with **Tauri v2** (Rust backend) and **React 18** (TypeScript frontend). The app provides secure, local-first AI chat experiences with multiple provider support (OpenAI, Anthropic, custom endpoints).

## Architecture & Key Concepts

### Core Module Structure
- **`src/core/`** - Business logic layer (provider management, storage, chat functionality)
- **`src/ui/`** - React components and pages
- **`src-tauri/`** - Rust backend with custom file system and secure credential storage

## Development Patterns

### Component Structure
- **Functional components** with hooks only
- **Framer Motion** for all animations and micro-interactions
- **Mobile-first responsive design** with Tailwind CSS v4
- **Safe area insets** handled in layout components: `paddingTop: "calc(env(safe-area-inset-top) + 8px)"`

### UI Design Language

#### Color Palette & Background
- **Primary background**: `bg-[#050505]` (deep black)
- **Surface backgrounds**: `bg-[#0b0b0d]`, `bg-[#0b0c12]/90`, `bg-black/45`
- **Text colors**: `text-white` (primary), `text-gray-100`, `text-gray-400` (secondary), `text-white/50` (muted)
- **Glass morphism**: Extensive use of `backdrop-blur-xl`, `backdrop-blur-sm` with translucent backgrounds

#### Border & Visual Hierarchy
- **Primary borders**: `border-white/10` (subtle), `border-white/20` (hover), `border-white/25` (active)
- **Rounded corners**: Consistent use of `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-3xl` (24px)
- **Shadows**: Deep, layered shadows like `shadow-[0_30px_120px_rgba(0,0,0,0.65)]`, `shadow-[0_18px_60px_rgba(0,0,0,0.35)]`

#### Interactive Elements
- **Buttons**: Always use `transition-all duration-150` or `transition` for smooth interactions
- **Hover states**: Consistent pattern of increasing border opacity and background lightness
- **Active states**: `active:scale-[0.99]` or Framer Motion `whileTap={{ scale: 0.98 }}`
- **Focus states**: `focus:outline-none focus:ring-2 focus:ring-white/20`

#### Form Elements
- **Input styling**: `rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40`
- **Focus states**: `focus:border-white/30 focus:outline-none`
- **Labels**: Small, semi-bold with `text-[11px] font-medium text-white/70`

#### Motion Patterns
- **Page transitions**: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}`
- **Button interactions**: `whileTap={{ scale: 0.98 }}`, `whileHover={{ scale: 1.02 }}`
- **Menu animations**: Spring-based with staggered delays for list items
- **Layout animations**: Use `layoutId` for smooth element transitions
- **Tab navigation**: `layoutId="activeTab"` with spring transitions for active states
- **Drag interactions**: Custom drag controls for dismissible modals with momentum
- **Entrance delays**: Stagger animations with `delay: 0.05` increments for list items

#### Component Patterns
- **Cards**: `rounded-2xl border border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10`
- **Menu items**: Consistent 12px height with icon + text + chevron layout
- **Status indicators**: Small pills with `rounded-full border border-white/10 bg-white/5 px-3 py-1`
- **Gradient accents**: `bg-gradient-to-br from-[color] to-[color]` for emphasis elements

#### Typography Scale
- **Headings**: `text-xl font-semibold` (large), `text-lg font-semibold` (medium), `text-sm font-medium` (small)
- **Body text**: `text-sm` (primary), `text-xs` (secondary), `text-[11px]` (captions)
- **Tracking**: Use `tracking-[0.35em]` for uppercase labels, `tracking-[0.4em]` for brand text

#### Layout Principles
- **Spacing**: Consistent use of `gap-3`, `gap-4`, `space-y-3`, `space-y-4` for component spacing
- **Padding**: `px-4 py-3` for buttons, `px-6 py-4` for larger inputs, `px-3 py-2` for compact elements
- **Max widths**: `max-w-md` for mobile-first container, `max-w-xl` for modals/sheets

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
- **Navigation**: `TopNav` with sticky positioning and blur backdrop, `TabBar` with spring animations
- **Modals**: `BottomMenu` component with drag-to-dismiss and glass morphism styling
- **Form patterns**: Consistent field components with labels, descriptions, and validation states

## Common Patterns

### UI Component Patterns

#### Background & Atmosphere
- **Main background**: Always `bg-[#050505]` with `text-gray-100` base text
- **Background aura**: Subtle gradient overlays using blur effects for depth
- **Surface elevation**: Layer surfaces with `bg-white/5`, `bg-white/10` for hierarchy

#### Navigation Components
- **TopNav**: Sticky header with `bg-[#050505]/85 backdrop-blur-xl` and safe area handling
- **TabBar**: Fixed bottom navigation with spring animations and `layoutId` transitions
- **Back buttons**: `rounded-full border border-white/15 px-3 py-1.5` with arrow icons

#### Form & Input Patterns
- **Text inputs**: `rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40`
- **Focus states**: Always `focus:border-white/30 focus:outline-none`
- **Field labels**: `text-[11px] font-medium text-white/70` positioned above inputs
- **Validation states**: Green for success (`border-emerald-400/40 bg-emerald-400/20`), red/amber for errors

#### Button Hierarchy
- **Primary actions**: `rounded-full border border-emerald-400/40 bg-emerald-400/20 text-emerald-100`
- **Secondary actions**: `rounded-xl border border-white/10 bg-white/5 text-white`
- **Icon buttons**: `rounded-full border border-white/15 bg-white/5` with hover states
- **All buttons**: Include `transition` and Framer Motion `whileTap={{ scale: 0.98 }}`

#### Card & List Patterns
- **List items**: `rounded-xl border border-white/10 bg-white/5 px-4 py-3` with hover states
- **Cards**: `rounded-2xl` with gradient backgrounds and deep shadows
- **Menu buttons**: `rounded-2xl border border-white/10 bg-white/5 p-4` with icon + text layout

#### Modal & Sheet Patterns
- **BottomMenu**: Drag-to-dismiss with `rounded-t-3xl` and backdrop blur
- **Overlay**: `bg-black/60 backdrop-blur-sm` for modal backgrounds
- **Menu headers**: Icon + title + close button layout with proper spacing

#### Status & Feedback
- **Loading states**: Spinning borders with `border-white/10 border-t-white/60`
- **Empty states**: Centered with icon + descriptive text in muted colors
- **Success/Error messages**: Rounded containers with appropriate color schemes
- **Badges**: `rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px]`

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