# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal tool for Pecko (Singapore wire harness manufacturer) that converts customer Bill of Materials
Excel files into Odoo v18-ready import files (`product-import.xlsx` + `bom-import.xlsx`). Extraction is
**deterministic** — each customer sends a fixed Excel layout, so the app reads cells by a per-customer
column mapping (no AI / no Anthropic API key; a future optional AI mode is anticipated). This repo is
being expanded into a broader "Back Office" app beyond just BOM conversion — new modules should follow
the same route/service/page conventions below.

## Commands

```bash
npm run dev              # server (:3001, --watch) + client (:5173, Vite) concurrently
npm run setup             # db:push + db:generate + db:seed — run once after cloning / schema changes
npm run db:push           # push prisma/schema.prisma to the SQLite DB (no migration files)
npm run db:generate       # regenerate the Prisma client
npm run db:seed           # seed initial admin user
npm start                 # production: NODE_ENV=production node server/index.js (serves API + built client/dist)
npm run build:client       # build the React app into client/dist

# server (from server/, or --workspace=server)
npm test                  # jest, ESM via --experimental-vm-modules — no test files exist yet

# client (from client/, or --workspace=client)
npm run lint               # eslint .
```

Single test: `node --experimental-vm-modules node_modules/.bin/jest <path>` from `server/`.

## Architecture

npm workspaces monorepo: `server/` (Express 5 API) and `client/` (React 18 + Vite SPA), started
together via `concurrently` in dev, served as one process in production (`server/index.js` serves
`client/dist` for all non-`/api` routes).

### Server (`server/`)

- **Routes** (`server/routes/`): one file per resource, mounted in `index.js` under `/api/<resource>`.
  All routes except `/api/setup` and `/api/auth` are protected by `requireAuth`; admin-only routes
  additionally use `requireAdmin` (`server/middleware/adminOnly.js`).
- **Auth**: JWT access + refresh tokens in HTTP-only cookies (see `routes/auth.js`,
  `middleware/auth.js`). `client/src/lib/api.js` has an axios interceptor that auto-refreshes on 401
  and retries the original request once — it explicitly skips intercepting `/auth/*` calls to avoid a
  deadlock (refresh-of-refresh).
- **Conversion pipeline** (`routes/convert.js`), the core flow — **deterministic, no AI/API key**:
  1. `services/fileParser.js` — Excel → rows (array-of-arrays via SheetJS). PDF/image still parse to
     raw text but the extractor below is Excel-only.
  2. `services/bomExtractor.js` — reads cells by the customer's fixed column mapping
     (`Customer.columnMapping` JSON, or `DEFAULT_MAPPING` = the standard K&S A–H layout when null) and
     returns `{ parent, children }`. Each customer sends a fixed layout, so this is pure column lookup.
  3. UOM and manufacturer-name mappings are applied in `convert.js` — customer UOM strings converted via
     `UnitOfMeasureMapping` (replace unit + multiply quantity by `conversionFactor`), manufacturer names
     via the global, case-insensitive `ManufacturerMapping` lookup
  4. `services/excelGenerator.js` — writes the two Odoo v18 import files (SheetJS)
  5. New items not already in `ProductRegistry` are auto-registered fire-and-forget (doesn't block the
     response); `ProductRegistry` maps part numbers to Odoo external IDs for re-imports
  6. Every attempt (success or failure) writes a `ConversionLog` row
- **Data model** (`prisma/schema.prisma`, SQLite): `User`, `Customer` (`columnMapping` JSON = which Excel
  columns map to which BOM fields; `description` is now just free-text notes), `UnitOfMeasureMapping`
  (per-customer), `ManufacturerMapping`
  (global), `ProductRegistry`, `ConversionLog`. SQLite has no native enums — `Role`
  (`ADMIN`/`USER`) and `ConversionStatus` (`SUCCESS`/`FAILED`) are plain strings enforced by Zod at
  the API layer, not the DB.
- Uploaded files and generated output live under `UPLOAD_DIR` (default `./uploads`), namespaced by a
  per-conversion `jobId`; downloads are served through `routes/download.js`.

### Client (`client/`)

- React Router routes are defined in `App.jsx`: `/login` and `/setup` are public; everything else is
  wrapped in `ProtectedRoute` → `AppShell`, with `/settings/users` and `/settings/advanced` further
  gated by `AdminRoute`.
- On mount, `App.jsx` calls `GET /api/setup/status` to decide whether to redirect to `/setup` (no admin
  user exists yet) before rendering routes.
- `pages/settings/*` are the admin configuration screens (Customers, UOM, Manufacturer Mappings,
  Product Registry, Users, Advanced) that feed the conversion pipeline above.
- Path alias `@` → `client/src` (see `vite.config.js`).

## Deployment

Designed for Railway (persistent filesystem, needed for SQLite + uploaded files) — see `railway.toml`.
Vercel is possible only for the frontend, or with SQLite→Postgres and local storage→blob storage
migrations (not implemented); see README for details if that path is ever pursued.
