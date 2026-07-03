# Pecko BOM Converter

An internal AI-powered tool that converts customer Bill of Materials (BOM) files — Excel, PDF, or image — into Odoo v18-ready import files in seconds.

Built for Pecko, a Singapore wire harness manufacturer.

---

## What it does

Customers send BOMs in their own fixed Excel formats. This tool reads each file by the customer's saved column mapping, normalises it against your unit-of-measure and manufacturer mappings, and produces two ready-to-import Excel files (deterministic — no AI, no API key):

| Output file | Odoo module |
|---|---|
| `product-import.xlsx` | Inventory → Products |
| `bom-import.xlsx` | Manufacturing → Bills of Materials |

---

## Features

- **Deterministic extraction** — reads each customer's fixed Excel layout by column mapping; no AI, no per-conversion cost
- **Per-customer column mapping** — set each customer's Excel column layout once; the converter follows it every time
- **UOM mapping** — map customer unit names (EA, MTR, FT) to your ERP units with conversion factors, importable via CSV/Excel
- **Manufacturer name normalisation** — map customer shorthand (ZEBRA, TYCO ELECTRONICS) to your exact ERP names, global across all customers, importable via CSV/Excel
- **Odoo v18 BOM format** — correct column headers, `__export__.mrp_bom_` ID format, "Manufacture this product" BOM type
- **Role-based access** — Admin and User roles; Admins manage settings, all users can convert
- **Conversion history** — dashboard shows recent activity, file names, success/failure status
- **Self-hosted** — one `npm start` serves both the API and the React frontend

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, react-hook-form, Zod |
| Backend | Node.js, Express, Prisma ORM |
| Database | SQLite (self-hosted) |
| Extraction | Deterministic column-mapping (no AI) |
| Auth | JWT access + refresh tokens, HTTP-only cookies |
| Excel output | xlsx (SheetJS) |

---

## Quick start (development)

### Prerequisites

- Node.js ≥ 18

### 1 — Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/pecko-backoffice.git
cd pecko-backoffice
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
DATABASE_URL="file:./prisma/pecko.db"
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
JWT_REFRESH_SECRET=<run the same command again for a different secret>
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### 3 — Initialise the database

```bash
npm run setup        # creates the DB, runs migrations, seeds a demo admin
```

### 4 — Start

```bash
npm run dev          # server on :3001, React dev server on :5173
```

Open [http://localhost:5173](http://localhost:5173) and sign in with the seeded admin account.

---

## Production (self-hosted on your own server)

```bash
cp .env.example .env    # fill in production values, set NODE_ENV=production
npm run setup           # initialise database
npm start               # serves API + built React app on PORT (default 3001)
```

**Auto-start on server login:**

```bash
chmod +x scripts/install-service.sh
./scripts/install-service.sh
```

Installs a `systemd` service (Linux) or `launchd` plist (macOS) that starts the app automatically on boot.

---

## Deploying to the cloud

> **Important:** Vercel's serverless platform has no persistent filesystem. SQLite files and uploaded BOM files cannot survive between requests on Vercel without migration. The options below are ordered easiest → most complex.

---

### Option A — Railway (recommended, zero code changes) ⭐

Railway *can* give you a persistent filesystem, but only if you attach a Volume — without one, the
container disk is wiped on every deploy and both the SQLite database and uploaded files reset to
nothing.

1. Push this repo to GitHub (see [Pushing to GitHub](#pushing-to-github) below)
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select this repository
4. **Settings → Volumes → New Volume**, mount path `/data`
5. Add all environment variables from `.env.example` in the Railway dashboard, setting
   `DATABASE_URL=file:/data/pecko.db` and `UPLOAD_DIR=/data/uploads` so both live inside the volume
6. Railway auto-detects Node.js and runs `npm start`
7. You get a public `https://yourapp.railway.app` URL

Cost: free Hobby tier available; ~$5/month for always-on production.

---

### Option B — Vercel frontend + Railway backend

Best of both worlds: Vercel's global CDN for the React app, Railway for the backend.

**Step 1 — Deploy the backend to Railway** (follow Option A above). Note the Railway URL.

**Step 2 — Create `client/.env.production`:**

```env
VITE_API_URL=https://your-app.railway.app
```

**Step 3 — Deploy the frontend to Vercel:**

1. Go to [vercel.com](https://vercel.com) → **New Project** → import this GitHub repo
2. Set **Framework Preset** → **Vite**
3. Set **Root Directory** → `client`
4. Add environment variable `VITE_API_URL` = your Railway backend URL
5. Click **Deploy**

**Step 4 — Update CORS:** In Railway, update `CLIENT_URL` to your Vercel frontend URL so the backend allows requests from it.

---

### Option C — Full Vercel (requires database + storage migration)

Vercel serverless requires replacing SQLite with a cloud database and replacing local file storage with cloud blob storage.

#### Database: SQLite → Neon PostgreSQL (free tier)

1. Sign up at [neon.tech](https://neon.tech), create a project, copy the connection string
2. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Restore `enum` types (SQLite limitation no longer applies):
   ```prisma
   enum Role { ADMIN USER }
   enum ConversionStatus { SUCCESS FAILED }
   ```
4. Run `npx prisma db push` against the Neon connection string

#### File storage: Local → Vercel Blob

```bash
npm install @vercel/blob --workspace=server
```

In `server/routes/convert.js`, replace `writeFileSync` with `put()` from `@vercel/blob`, and update download URLs accordingly.

#### Serverless configuration: add `vercel.json`

```json
{
  "version": 2,
  "builds": [
    {
      "src": "client/package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist" }
    },
    { "src": "server/index.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "server/index.js" },
    { "src": "/(.*)", "dest": "client/dist/$1" }
  ]
}
```

#### Deploy

```bash
npm install -g vercel
vercel --prod
```

Add all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Pushing to GitHub

```bash
# 1. Create a new repo on github.com (don't add any files)

# 2. In this project folder:
git remote add origin https://github.com/YOUR_USERNAME/pecko-backoffice.git
git branch -M main
git push -u origin main
```

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:./prisma/pecko.db` for SQLite · or PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Long random string for signing access tokens |
| `JWT_REFRESH_SECRET` | ✅ | Separate long random string for refresh tokens |
| `PORT` | — | Server port (default `3001`) |
| `NODE_ENV` | — | `development` or `production` |
| `CLIENT_URL` | ✅ | Frontend origin for CORS — must match the URL users open |
| `HTTPS` | — | `true` only if your server is behind HTTPS/TLS |
| `UPLOAD_DIR` | — | Where BOM files are stored (default `./uploads`) |
| `LOG_LEVEL` | — | `info` · `debug` · `error` |

---

## Project structure

```
pecko-backoffice/
├── client/                        React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── Convert.jsx            BOM upload UI
│       │   ├── Dashboard.jsx          Conversion history & stats
│       │   └── settings/
│       │       ├── Customers.jsx      Customer BOM format instructions
│       │       ├── UnitOfMeasure.jsx  UOM mappings (per customer, importable)
│       │       ├── ManufacturerMappings.jsx  Manufacturer name mappings (global, importable)
│       │       └── Users.jsx          User management
│       └── components/layout/         Sidebar, TopBar, auth route guards
├── server/                        Express API
│   ├── routes/                    One file per resource
│   ├── services/
│   │   ├── bomExtractor.js        Deterministic column-mapping extraction
│   │   ├── excelGenerator.js      Odoo-format Excel output (SheetJS)
│   │   └── fileParser.js          Excel / PDF / image → structured text
│   └── middleware/                JWT auth, multer upload, admin guard
├── prisma/
│   ├── schema.prisma              Database models
│   └── seed.js                    Initial admin user + demo data
├── scripts/
│   ├── start.sh                   Production startup with health checks
│   └── install-service.sh         Auto-start service installer
└── .env.example                   All environment variable documentation
```

---

## How a conversion works

```
Customer BOM file  (Excel / PDF / image)
        │
        ▼
  fileParser.js        Extracts row data and raw text from the file
        │
        ▼
  bomExtractor.js      Reads cells by the customer's fixed column mapping and returns
                       a structured object with the parent assembly
                       and all child components.
        │
        ▼
  convert.js           Applies UOM mappings (customer-specific)
                       Applies manufacturer name mappings (global, case-insensitive)
        │
        ▼
  excelGenerator.js    Writes two Odoo v18 import files:
                       • product-import.xlsx
                       • bom-import.xlsx
        │
        ▼
  Download links       Served from /api/download/:jobId/
```

---

## License

Internal use only — Pecko Pte. Ltd.
