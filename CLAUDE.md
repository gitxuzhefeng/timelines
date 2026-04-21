# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimeLens is a local-first macOS/Windows desktop app built with **Tauri 2** (Rust backend + React frontend). It passively tracks window/app usage, captures smart screenshots, and aggregates sessions into a timeline. All data stays on device in SQLite.

## Commands

All commands should be run from the `project/` directory unless noted.

```bash
# Development
npm run dev          # Vite dev server (frontend only)
npm run tauri dev    # Full Tauri app in dev mode (runs Rust + frontend)

# Build
npm run build        # TypeScript check + Vite production build
npm run tauri build  # Full desktop app build

# Testing
npm run test         # Rust unit tests (cargo test)

# Verification
npm run verify       # Check no external fetch calls (scripts/check-no-external-fetch.mjs)
```

From the repo root, the same scripts delegate to `project/`:
```bash
npm run dev / tauri dev / build / test / release
```

Rust tests directly:
```bash
cargo test --manifest-path project/src-tauri/Cargo.toml
cargo test --manifest-path project/src-tauri/Cargo.toml -- <test_name>
```

## Architecture

### Stack
- **Frontend**: React 18, React Router 7, Zustand 5, Tailwind CSS 4, Vite 6, TypeScript
- **Backend**: Rust, Tauri 2, SQLite (rusqlite bundled), Tokio async runtime
- **Platform**: macOS (Objective-C via objc2) and Windows (Win32 API)

### Directory Layout

```
project/
├── src/                    # React frontend
│   ├── pages/              # 11 page components (Timeline, Sessions, TodayLens, OcrSearch, etc.)
│   ├── components/         # Reusable UI components
│   ├── stores/             # Zustand state (appStore, themeStore, devModeStore)
│   ├── services/tauri.ts   # IPC bridge — all Rust↔React communication
│   ├── layout/             # Layout components
│   ├── lib/                # Utilities
│   └── types/              # TypeScript types
└── src-tauri/src/          # Rust backend
    ├── core/
    │   ├── acquisition/    # Platform-specific window tracking (macOS/Windows)
    │   ├── collection/     # Event capture pipeline, tracker, phase2 processing
    │   ├── storage/        # SQLite db + migrations
    │   ├── ocr/            # OCR engine (macOS Vision / Windows OCR)
    │   ├── aggregation/    # Session aggregation pipeline
    │   ├── models.rs       # Core data types (WindowSession, Snapshot, ActivityStats, etc.)
    │   ├── settings.rs     # App configuration
    │   └── privacy.rs      # Redaction logic
    ├── analysis/           # AI-driven daily insights (ai_client.rs, daily.rs, report.rs)
    └── api/commands.rs     # 40+ Tauri command handlers exposed to frontend
```

### Data Flow

```
Acquisition (macOS/Windows OS APIs)
  → Collection pipeline (crossbeam channels, Tokio)
  → SQLite storage
  → Tauri IPC commands (#[tauri::command])
  → services/tauri.ts (invoke() wrappers)
  → Zustand appStore
  → React pages/components
```

### Internationalization (i18n)

All UI text, page interactions, and user-facing messages must support both Chinese (`zh-CN`) and English (`en`). Follow these rules when writing frontend code:

- Never hardcode display strings in components. Always use the `useTranslation` hook and reference keys from the locale files.
- When adding a new string, add the corresponding key to **both** `zh-CN.json` and `en.json` before using it.
- Locale files live in `project/src/i18n/` (or the established locale directory). Keep keys organized by page/feature namespace.
- Error messages, toast notifications, tooltips, button labels, and empty-state copy all count as UI text and must be translated.
- Rust-side strings that surface to the user (e.g., report content, AI prompts) must also have Chinese and English variants, selected based on the `lang` setting passed from the frontend.

### Key Patterns

- **IPC bridge**: All frontend↔backend calls go through `project/src/services/tauri.ts`. This file wraps every Rust command with a typed async function. When adding new Rust commands, add the corresponding wrapper here.
- **State**: `appStore.ts` is the central Zustand store holding sessions, snapshots, tracking status, permissions, and stats. Pages read from this store and call tauri.ts functions to mutate.
- **Platform abstraction**: `core/acquisition/` has separate implementations for macOS and Windows, unified behind a common interface.
- **Custom protocol**: Snapshot images are served via the `timelens://` custom Tauri protocol (not HTTP).
- **No external network by default**: The `verify` script enforces no external fetch calls in the frontend. The only network usage is the optional AI analysis feature in `analysis/ai_client.rs`.

## Release Notes Requirement

For every release, always include a Mac troubleshooting note in the release notes. Use the optimized copy below:

"If you see \"TimeLens.app is damaged and can't be opened\" on macOS, this is usually caused by the system quarantine attribute rather than actual file corruption. Run the command below in Terminal:

xattr -rd com.apple.quarantine \"/Applications/TimeLens.app\""
