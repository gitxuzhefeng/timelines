# GEMINI.md - TimeLens Project Context

## Project Overview
TimeLens is an AI-driven personal time-tracking application designed for knowledge workers. It automatically records computer usage (active windows and periodic screenshots), analyzes activity patterns, and generates daily summaries. 

### Core Philosophy
- **Zero-Friction Recording**: Runs silently in the background (system tray).
- **Privacy First**: 100% local data storage in a SQLite database and local file system. No data is sent to the cloud without explicit user action (future feature).
- **Deep Context**: Captures window titles and screenshots to provide a "flat timeline" of user behavior.

### Tech Stack
- **Framework**: Tauri 2.0 (Cross-platform desktop framework).
- **Backend (Rust)**:
  - `WindowTracker`: macOS-native window tracking (Cocoa/Accessibility API).
  - `CaptureService`: Intelligent screenshot engine (WebP compression, ~20-50KB per shot).
  - `Database`: SQLite (`rusqlite`) for temporal event storage.
  - `timelens://` Protocol: Custom URI scheme to safely serve local screenshots to the React frontend.
- **Frontend (React)**:
  - `TypeScript` + `Vite` + `TailwindCSS`.
  - `Zustand`: Global state management for real-time event updates.
  - `React Virtuoso`: High-performance virtualized list for rendering large timelines.
  - `i18next`: Localization (English/Chinese).

---

## Directory Structure
- `/timelens`: Main application root.
  - `/src-tauri`: Rust backend source code.
    - `/src/tracker`: Window focus tracking logic.
    - `/src/capture`: Screenshot and image processing logic.
    - `/src/storage`: SQLite database and file system management.
  - `/src`: React frontend source code.
    - `/pages/DeveloperDashboard.tsx`: Primary view for real-time behavioral monitoring.
    - `/stores/appStore.ts`: Zustand store for events and settings.
    - `/locales`: Translation files.
- `/PRD_*.md`: Product Requirement Documents and technical specifications.

---

## Building and Running

### Prerequisites
- **Node.js**: v18+ (pnpm recommended).
- **Rust**: v1.70+ (cargo).
- **macOS Permissions**: Accessibility and Screen Recording permissions are required for tracking to function.

### Development Commands
Run these commands from the `/timelens` directory:

```bash
# Install dependencies
pnpm install

# Start in development mode (HMR frontend + Rust debug)
pnpm tauri dev

# Run unit tests
pnpm vitest
```

### Build Commands
```bash
# Build production bundles
pnpm tauri build
```

---

## Development Conventions

### Data Storage
- Data is stored in `~/.timelens/` (macOS).
- Images are stored as `.webp` in `~/.timelens/data/shots/YYYY-MM-DD/`.
- Database file: `~/.timelens/timelens.db`.

### Backend (Rust)
- **Error Handling**: Use `thiserror` for library errors and `String` for Tauri command results.
- **Concurrency**: Use `tokio::sync::mpsc` for communication between the tracker and the capture service.
- **Permissions**: macOS permission checks are implemented in `lib.rs` and can be re-triggered via `restart_tracking` command.

### Frontend (React)
- **Real-time Updates**: Listen for `window_event_updated` and `new_snapshot_saved` events via Tauri's `listen` API.
- **Styling**: Strictly use TailwindCSS utility classes.
- **Components**: Prefer small, functional components. Currently, components are being migrated from `DeveloperDashboard.tsx` into separate files in `/src/components`.

### Localization
- Always use `t('key')` from `react-i18next`.
- Keep `zh-CN.json` and `en-US.json` synchronized.

---

## Key Files for Investigation
- `timelens/src-tauri/src/lib.rs`: App entry point, URI scheme registration, and command handlers.
- `timelens/src-tauri/src/tracker/mod.rs`: The main loop for window polling and event generation.
- `timelens/src/pages/DeveloperDashboard.tsx`: The heart of the UI, handling real-time data flow.
- `timelens/src-tauri/src/storage/mod.rs`: Database schema and CRUD operations.
