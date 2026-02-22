# TOOSII-XD ULTRA

## Overview

This project is a WhatsApp Multi-Device Bot called "TOOSII-XD ULTRA" built with the `gifted-baileys` library, wrapped inside a Replit full-stack web application scaffold. The project has two main parts:

1. **WhatsApp Bot** (`bot/` directory) — A CommonJS Node.js bot that connects to WhatsApp via the Baileys multi-device protocol. It handles commands for AI chat, media downloading, sticker creation, group management, games, and more.
2. **Web Application Shell** (root-level `server/`, `client/`, `shared/`) — A React + Express + Vite + Drizzle/PostgreSQL scaffold that currently serves as a launcher for the bot process. The web frontend is mostly empty (only a 404 page exists), and the Express server (`server/index.ts`) simply spawns the bot as a child process.

There is also a duplicate of the bot code in `extracted_bot/` which appears to be an earlier standalone version — the canonical bot code lives in `bot/`.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Two-Layer Architecture

**Web Layer (TypeScript/ESM):**
- **Server**: Express-based, defined in `server/index.ts`. Currently it does NOT set up Express routes or serve the frontend — it just spawns `node bot/index.js` as a child process and pipes stdio through.
- **Frontend**: React 18 app using Vite, located in `client/src/`. Uses shadcn/ui components (New York style), Tailwind CSS, Radix UI primitives, wouter for routing, and TanStack React Query. Currently has no real pages — just a 404 fallback.
- **Shared schema**: `shared/schema.ts` defines a PostgreSQL `users` table using Drizzle ORM with `id`, `username`, and `password` fields. This schema is separate from the bot's user tracking.
- **Storage**: `server/storage.ts` provides an in-memory storage implementation (MemStorage) with a `IStorage` interface for user CRUD. PostgreSQL via Drizzle is configured but the storage layer doesn't use it yet.

**Bot Layer (CommonJS):**
- Entry point: `bot/index.js` — creates a WhatsApp socket connection using `gifted-baileys`, handles authentication via `useMultiFileAuthState`, and processes incoming messages.
- Command handler: `bot/client.js` — processes messages and routes them to commands.
- Configuration: `bot/setting.js` — global settings stored on `global.*` (owner number, bot name, prefixes, feature toggles).
- Plugin system: `bot/plugin/` directory contains modular command handlers (e.g., `polination-ai.js`). Each plugin exports `type`, `command` array, and `operate` async function.
- Library modules: `bot/library/` contains:
  - `lib/` — utility functions (exif/sticker processing, helper functions, in-memory store)
  - `scrape/` — web scrapers (Facebook, Wikimedia, anime sites, news)
  - `menulist/` — static menu text strings for different command categories
- Bot data: `bot/database/` — JSON files for user tracking, game data, and leaderboards.
- The bot uses CommonJS (`{"type": "commonjs"}` in `bot/package.json`) while the web layer uses ESM.

### Build System

- **Dev**: `tsx server/index.ts` — runs the TypeScript server which spawns the bot
- **Build**: `script/build.ts` — uses Vite to build the client and esbuild to bundle the server, outputting to `dist/`
- **Production**: `node dist/index.cjs`
- **Database migrations**: `drizzle-kit push` via `db:push` script

### Key Design Decisions

1. **Bot as child process**: Rather than integrating the bot logic into the Express server, the server spawns it as a separate Node.js process. This keeps the CommonJS bot isolated from the ESM web layer.
2. **Dual module systems**: The web app uses ESM (`"type": "module"` in root package.json), while the bot uses CommonJS (`"type": "commonjs"` in `bot/package.json`). This is intentional to avoid rewriting the bot.
3. **In-memory storage default**: The web layer uses `MemStorage` by default. The Drizzle config and schema are ready for PostgreSQL but not wired into the storage layer yet.
4. **Plugin architecture**: Bot commands are modular — each file in `bot/plugin/` is a self-contained command module that gets loaded dynamically.

### Database

- **PostgreSQL** (via Drizzle ORM) is configured for the web application layer but not yet actively used. The schema is in `shared/schema.ts`.
- **JSON files** (`bot/database/`) are used by the WhatsApp bot for user data, game state, and leaderboards. These are read/written directly via `fs`.

## External Dependencies

### Core Services
- **WhatsApp Multi-Device API**: Via `gifted-baileys` (Baileys fork) — the core protocol library for connecting to WhatsApp
- **PostgreSQL**: Configured via `DATABASE_URL` environment variable, managed with Drizzle ORM and `drizzle-kit`

### AI Services
- **Pollinations AI** (`text.pollinations.ai`) — Free AI text generation API used in the polination-ai plugin

### Media/Content APIs
- **YouTube**: Via `yt-search` and `@distube/ytdl-core` for music/video search and download
- **Instagram**: Via `btch-downloader` for media downloading
- **Facebook**: Custom scraper using `fdown.net` for video downloading
- **Catbox.moe**: File upload service used for media hosting
- **bot.lyo.su**: Quote image generation API

### Web Scraping Targets
- JKT48 news, OtakuDesu (anime), Kusonime (anime), Komiku (manga), Wikimedia Commons

### Frontend Libraries
- React 18, Vite, Tailwind CSS, shadcn/ui (Radix UI primitives), wouter (routing), TanStack React Query

### Deployment
- Configured for Heroku (`app.json`), Railway (`railway.json`), and Replit
- Uses worker dyno on Heroku (not web) since the bot is a persistent process