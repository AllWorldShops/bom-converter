# Pecko BOM Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack internal web app that parses customer BOM files (Excel/PDF/image) and converts them into two Odoo v18-compatible Excel import files using Claude AI.

**Architecture:** Express REST API + PostgreSQL (Prisma ORM) backend with JWT auth; React 18 + Vite + TailwindCSS + shadcn/ui frontend. File parsing via SheetJS/pdf-parse/Tesseract; AI extraction via Anthropic Claude; Excel generation via SheetJS.

**Tech Stack:** Node.js 20, Express 5, Prisma 5, PostgreSQL 16, React 18, Vite 5, TailwindCSS 3, shadcn/ui, SheetJS, pdf-parse, Tesseract.js, @anthropic-ai/sdk, JWT (jsonwebtoken), bcrypt, Zod, multer

---

## File Map

```
/pecko-bom-converter
  /server
    index.js                         — Express app + server boot
    /middleware
      auth.js                        — JWT verify middleware
      adminOnly.js                   — Role=ADMIN guard
      upload.js                      — multer config (20MB, MIME validation)
    /routes
      auth.js                        — POST /login, POST /logout, POST /refresh
      users.js                       — CRUD /api/users (admin)
      customers.js                   — CRUD /api/customers (admin)
      uomMappings.js                 — CRUD /api/uom-mappings (admin)
      convert.js                     — POST /api/convert
      download.js                    — GET /api/download/:jobId/:filename
      dashboard.js                   — GET /api/dashboard/stats
      setup.js                       — GET/POST /api/setup (first-run admin seed)
    /services
      fileParser.js                  — parse xlsx/pdf/image → raw rows/text
      aiExtractor.js                 — call Claude API → structured JSON
      excelGenerator.js              — generate product + BOM xlsx buffers
    /lib
      prisma.js                      — Prisma client singleton
      logger.js                      — simple console logger wrapper
  /prisma
    schema.prisma
    seed.js
  /uploads
    /output                          — generated job folders (gitignored)
  /client
    vite.config.js
    tailwind.config.js
    /src
      main.jsx
      App.jsx
      /lib
        api.js                       — axios instance + interceptors
      /contexts
        AuthContext.jsx
      /hooks
        useAuth.js
      /components
        /layout
          AppShell.jsx               — sidebar + topbar wrapper
          Sidebar.jsx
          TopBar.jsx
          ProtectedRoute.jsx
          AdminRoute.jsx
        /ui                          — shadcn/ui generated components
      /pages
        Login.jsx
        SetupAdmin.jsx
        Dashboard.jsx
        Convert.jsx
        /settings
          Users.jsx
          Customers.jsx
          UnitOfMeasure.jsx
          Advanced.jsx
  .env.example
  README.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (root — workspaces)
- Create: `server/package.json`
- Create: `server/index.js`
- Create: `server/lib/prisma.js`
- Create: `server/lib/logger.js`
- Create: `prisma/schema.prisma`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Init root monorepo**

```bash
mkdir -p pecko-bom-converter && cd pecko-bom-converter
mkdir -p server/middleware server/routes server/services server/lib
mkdir -p prisma uploads/output
cat > package.json << 'EOF'
{
  "name": "pecko-bom-converter",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=server\" \"npm run dev --workspace=client\"",
    "migrate": "npx prisma migrate dev --schema=prisma/schema.prisma",
    "seed": "node prisma/seed.js"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
EOF
npm install
```

- [ ] **Step 2: Init server package**

```bash
cd server
cat > package.json << 'EOF'
{
  "name": "pecko-server",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "dev": "node --watch index.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@prisma/client": "^5.22.0",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "express": "^5.0.1",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "tesseract.js": "^5.1.1",
    "uuid": "^10.0.0",
    "xlsx": "^0.18.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
EOF
npm install
```

- [ ] **Step 3: Write Prisma schema**

Create `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  USER
}

enum ConversionStatus {
  SUCCESS
  FAILED
}

model User {
  id           String   @id @default(cuid())
  username     String
  email        String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  conversionLogs ConversionLog[]
}

model Customer {
  id          String   @id @default(cuid())
  name        String   @unique
  description String   @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  uomMappings    UnitOfMeasureMapping[]
  conversionLogs ConversionLog[]
}

model UnitOfMeasureMapping {
  id               String   @id @default(cuid())
  customerId       String
  customerUOM      String
  peckoUOM         String
  conversionFactor Float    @default(1)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([customerId, customerUOM])
}

model ConversionLog {
  id                String           @id @default(cuid())
  userId            String
  customerId        String
  originalFilename  String
  status            ConversionStatus
  productsConverted Int              @default(0)
  bomsConverted     Int              @default(0)
  createdAt         DateTime         @default(now())

  user     User     @relation(fields: [userId], references: [id])
  customer Customer @relation(fields: [customerId], references: [id])
}
```

- [ ] **Step 4: Create Prisma singleton**

Create `server/lib/prisma.js`:
```js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
export default prisma
```

- [ ] **Step 5: Create logger**

Create `server/lib/logger.js`:
```js
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const level = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info

export const logger = {
  error: (...args) => level >= 0 && console.error('[ERROR]', ...args),
  warn:  (...args) => level >= 1 && console.warn('[WARN]', ...args),
  info:  (...args) => level >= 2 && console.info('[INFO]', ...args),
  debug: (...args) => level >= 3 && console.debug('[DEBUG]', ...args),
}
```

- [ ] **Step 6: Create Express entry point**

Create `server/index.js`:
```js
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { logger } from './lib/logger.js'

import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import customersRouter from './routes/customers.js'
import uomRouter from './routes/uomMappings.js'
import convertRouter from './routes/convert.js'
import downloadRouter from './routes/download.js'
import dashboardRouter from './routes/dashboard.js'
import setupRouter from './routes/setup.js'

const app = express()

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/setup', setupRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/customers', customersRouter)
app.use('/api/uom-mappings', uomRouter)
app.use('/api/convert', convertRouter)
app.use('/api/download', downloadRouter)
app.use('/api/dashboard', dashboardRouter)

app.use((err, req, res, next) => {
  logger.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`))

export default app
```

- [ ] **Step 7: Create .env.example**

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/pecko_bom
JWT_SECRET=change-me-to-a-long-random-string
JWT_REFRESH_SECRET=change-me-to-another-long-random-string
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CLIENT_URL=http://localhost:5173
UPLOAD_DIR=./uploads
LOG_LEVEL=info
```

- [ ] **Step 8: Create .gitignore**

```
node_modules/
.env
uploads/output/
dist/
.DS_Store
```

- [ ] **Step 9: Run migration**

```bash
cp .env.example .env
# Fill in DATABASE_URL with your Postgres connection string
npx prisma migrate dev --name init --schema=prisma/schema.prisma
```

Expected: Migration applied, Prisma client generated.

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold project, prisma schema, express entry point"
```

---

## Task 2: Auth Middleware & Routes

**Files:**
- Create: `server/middleware/auth.js`
- Create: `server/middleware/adminOnly.js`
- Create: `server/routes/auth.js`
- Create: `server/routes/setup.js`

- [ ] **Step 1: Write auth middleware**

Create `server/middleware/auth.js`:
```js
import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Authentication required' })

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

- [ ] **Step 2: Write adminOnly middleware**

Create `server/middleware/adminOnly.js`:
```js
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
```

- [ ] **Step 3: Write setup route (first-run admin creation)**

Create `server/routes/setup.js`:
```js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../lib/prisma.js'

const router = Router()

// Returns whether an admin exists — used by frontend to decide whether to show Setup screen
router.get('/status', async (req, res) => {
  const count = await prisma.user.count({ where: { role: 'ADMIN' } })
  res.json({ setupRequired: count === 0 })
})

const setupSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

router.post('/', async (req, res, next) => {
  try {
    const count = await prisma.user.count({ where: { role: 'ADMIN' } })
    if (count > 0) return res.status(403).json({ error: 'Setup already completed' })

    const { username, email, password } = setupSchema.parse(req.body)
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { username, email, passwordHash, role: 'ADMIN' },
      select: { id: true, username: true, email: true, role: true },
    })

    res.status(201).json({ user })
  } catch (err) {
    next(err)
  }
})

export default router
```

- [ ] **Step 4: Write auth routes**

Create `server/routes/auth.js`:
```js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function signTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role, username: user.username }
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' })
  return { accessToken, refreshToken }
}

function setCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 })
  res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 })
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const { accessToken, refreshToken } = signTokens(user)
    setCookies(res, accessToken, refreshToken)
    res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } })
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ error: 'No refresh token' })
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
    const user = await prisma.user.findUnique({ where: { id: payload.id } })
    if (!user) return res.status(401).json({ error: 'User not found' })
    const { accessToken, refreshToken } = signTokens(user)
    setCookies(res, accessToken, refreshToken)
    res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('accessToken')
  res.clearCookie('refreshToken')
  res.json({ success: true })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, username: true, email: true, role: true },
  })
  res.json({ user })
})

export default router
```

- [ ] **Step 5: Commit**

```bash
git add server/middleware server/routes/auth.js server/routes/setup.js
git commit -m "feat: auth middleware, JWT login/logout/refresh, first-run setup endpoint"
```

---

## Task 3: User / Customer / UOM CRUD APIs + Dashboard Stats

**Files:**
- Create: `server/routes/users.js`
- Create: `server/routes/customers.js`
- Create: `server/routes/uomMappings.js`
- Create: `server/routes/dashboard.js`

- [ ] **Step 1: Users route (admin only)**

Create `server/routes/users.js`:
```js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const userSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'USER']),
})

const select = { id: true, username: true, email: true, role: true, createdAt: true }

router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.user.findMany({ select, orderBy: { createdAt: 'desc' } }))
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const { username, email, password, role } = userSchema.parse(req.body)
    if (!password) return res.status(400).json({ error: 'Password is required for new users' })
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { username, email, passwordHash, role }, select })
    res.status(201).json(user)
  } catch (err) { next(err) }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { username, email, password, role } = userSchema.parse(req.body)
    const data = { username, email, role }
    if (password) data.passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select })
    res.json(user)
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' })
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
```

- [ ] **Step 2: Customers route**

Create `server/routes/customers.js`:
```js
import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'

const router = Router()
router.use(requireAuth)

const customerSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
})

// GET all — available to all authenticated users (needed for Convert dropdown)
router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.customer.findMany({ orderBy: { name: 'asc' } }))
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id } })
    res.json(customer)
  } catch (err) { next(err) }
})

// Write operations — admin only
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = customerSchema.parse(req.body)
    res.status(201).json(await prisma.customer.create({ data }))
  } catch (err) { next(err) }
})

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const data = customerSchema.parse(req.body)
    res.json(await prisma.customer.update({ where: { id: req.params.id }, data }))
  } catch (err) { next(err) }
})

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
```

- [ ] **Step 3: UOM Mappings route**

Create `server/routes/uomMappings.js`:
```js
import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const mappingSchema = z.object({
  customerId: z.string(),
  customerUOM: z.string().min(1),
  peckoUOM: z.string().min(1),
  conversionFactor: z.number().positive(),
})

router.get('/', async (req, res, next) => {
  try {
    const { customerId } = req.query
    const where = customerId ? { customerId } : {}
    res.json(await prisma.unitOfMeasureMapping.findMany({ where, orderBy: { customerUOM: 'asc' } }))
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const data = mappingSchema.parse(req.body)
    res.status(201).json(await prisma.unitOfMeasureMapping.create({ data }))
  } catch (err) { next(err) }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { customerUOM, peckoUOM, conversionFactor } = mappingSchema.parse(req.body)
    res.json(await prisma.unitOfMeasureMapping.update({
      where: { id: req.params.id },
      data: { customerUOM, peckoUOM, conversionFactor },
    }))
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.unitOfMeasureMapping.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
```

- [ ] **Step 4: Dashboard stats route**

Create `server/routes/dashboard.js`:
```js
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.id
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalLogs,
      thisMonthLogs,
      recentLogs,
    ] = await Promise.all([
      prisma.conversionLog.aggregate({
        where: { userId, status: 'SUCCESS' },
        _sum: { productsConverted: true, bomsConverted: true },
        _count: { id: true },
      }),
      prisma.conversionLog.aggregate({
        where: { userId, status: 'SUCCESS', createdAt: { gte: startOfMonth } },
        _sum: { productsConverted: true, bomsConverted: true },
        _count: { id: true },
      }),
      prisma.conversionLog.findMany({
        where: { userId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } } },
      }),
    ])

    res.json({
      totalBomsConverted: totalLogs._count.id,
      bomsThisMonth: thisMonthLogs._count.id,
      totalProductsConverted: totalLogs._sum.productsConverted ?? 0,
      productsThisMonth: thisMonthLogs._sum.productsConverted ?? 0,
      recentActivity: recentLogs,
    })
  } catch (err) { next(err) }
})

export default router
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/
git commit -m "feat: users, customers, uom-mappings, dashboard stats CRUD routes"
```

---

## Task 4: File Upload Middleware & Parser Service

**Files:**
- Create: `server/middleware/upload.js`
- Create: `server/services/fileParser.js`

- [ ] **Step 1: multer upload middleware**

Create `server/middleware/upload.js`:
```js
import multer from 'multer'
import path from 'path'
import { mkdirSync } from 'fs'

const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'image/png',
  'image/jpeg',
])

const uploadDir = process.env.UPLOAD_DIR || './uploads'
mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
})
```

- [ ] **Step 2: File parser service**

Create `server/services/fileParser.js`:
```js
import { readFileSync } from 'fs'
import xlsx from 'xlsx'
import pdfParse from 'pdf-parse'
import Tesseract from 'tesseract.js'

/**
 * Parse an uploaded file into { rows: Array<Object>, rawText: string }
 * rows — for xlsx files (array of row objects keyed by column index)
 * rawText — for pdf/image files (plain text for AI)
 */
export async function parseFile(filePath, mimetype) {
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype === 'application/vnd.ms-excel') {
    return parseExcel(filePath)
  }
  if (mimetype === 'application/pdf') {
    return parsePdf(filePath)
  }
  if (mimetype.startsWith('image/')) {
    return parseImage(filePath)
  }
  throw new Error(`Unsupported MIME type: ${mimetype}`)
}

function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const rawText = rows.map(row => row.join('\t')).join('\n')
  return { rows, rawText }
}

async function parsePdf(filePath) {
  const buffer = readFileSync(filePath)
  const data = await pdfParse(buffer)
  return { rows: [], rawText: data.text }
}

async function parseImage(filePath) {
  const result = await Tesseract.recognize(filePath, 'eng')
  return { rows: [], rawText: result.data.text }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/middleware/upload.js server/services/fileParser.js
git commit -m "feat: multer upload middleware and file parser service (xlsx/pdf/image)"
```

---

## Task 5: AI Extractor Service

**Files:**
- Create: `server/services/aiExtractor.js`

- [ ] **Step 1: Write AI extractor**

Create `server/services/aiExtractor.js`:
```js
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RETURN_SCHEMA = `{
  "parent": {
    "itemId": "",
    "itemName": "",
    "uom": "",
    "quantity": 1
  },
  "children": [
    {
      "findNo": "",
      "itemId": "",
      "itemName": "",
      "revision": "",
      "quantity": "",
      "uom": "",
      "manufacturer": "",
      "manufacturerPartNo": ""
    }
  ]
}`

function buildSystemPrompt(customerDescription, uomMappings) {
  const uomJson = JSON.stringify(uomMappings.map(m => ({
    customerUOM: m.customerUOM,
    peckoUOM: m.peckoUOM,
    conversionFactor: m.conversionFactor,
  })), null, 2)

  return `You are a BOM (Bill of Materials) extraction specialist for Pecko, a wire harness manufacturer.
Your job is to extract structured data from customer BOM files.

Customer Format Instructions:
${customerDescription}

UOM Mapping for this customer:
${uomJson}

Rules:
1. Follow the customer format instructions strictly.
2. Row 1 is always the header. Skip it.
3. Row 2 is the parent/assembly part (the top-level BOM item).
4. Row 3 onwards are child/component parts.
5. Apply UOM conversion using the provided mapping (replace customerUOM with peckoUOM).
6. Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Return this exact JSON structure:
${RETURN_SCHEMA}

If you cannot confidently extract a field, use an empty string.`
}

function buildUserPrompt(rawText, rows) {
  const dataSection = rows.length > 0
    ? `Rows as JSON array:\n${JSON.stringify(rows, null, 2)}`
    : `Raw extracted text:\n${rawText}`

  return `Here is the BOM data extracted from the customer file:\n\n${dataSection}\n\nExtract and return the structured BOM as instructed.`
}

async function callClaude(systemPrompt, userPrompt) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  return response.content[0].text
}

export async function extractBom(rawText, rows, customer, uomMappings) {
  const systemPrompt = buildSystemPrompt(customer.description, uomMappings)
  const userPrompt = buildUserPrompt(rawText, rows)

  let text = await callClaude(systemPrompt, userPrompt)

  // Strip markdown code fences if Claude adds them despite instructions
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

  try {
    return JSON.parse(text)
  } catch {
    // Retry once with stricter instruction
    const strictPrompt = `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the raw JSON object. No text before or after. No markdown.`
    let retryText = await callClaude(systemPrompt, strictPrompt)
    retryText = retryText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    return JSON.parse(retryText)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/services/aiExtractor.js
git commit -m "feat: Claude AI BOM extraction service with retry on JSON parse failure"
```

---

## Task 6: Excel Generator Service

**Files:**
- Create: `server/services/excelGenerator.js`

- [ ] **Step 1: Write Excel generator**

Create `server/services/excelGenerator.js`:
```js
import xlsx from 'xlsx'

/**
 * Generate Product Import Excel buffer
 * Includes parent row + all children
 */
export function generateProductImport(parent, children) {
  const headers = [
    'External ID',
    'Name',
    'Internal Reference',
    'Unit of Measure',
    'Manufacturer/Customer Name',
    'MPN/Customer/Supplier Part No',
    'Sales',
    'Purchase',
    'Product Type',
    'routes',
    'Description',
  ]

  function toRow(item) {
    return [
      `__export__.product_template_${item.itemId}`,
      item.itemId,
      item.itemId,
      item.uom,
      item.manufacturer || '',
      item.manufacturerPartNo || '',
      'TRUE',
      'TRUE',
      'Goods',
      'PEI - Buy from Vendor',
      item.itemName,
    ]
  }

  const data = [headers, toRow(parent), ...children.map(toRow)]

  const ws = xlsx.utils.aoa_to_sheet(data)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Products')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Generate BOM Import Excel buffer
 * Row 2: parent cols A-C filled + first child cols D-J
 * Row 3+: cols A-C empty, cols D-J = remaining children
 */
export function generateBomImport(parent, children) {
  const headers = [
    'Product',
    'Product/MPN/Customer/Supplier Part No',
    'Product/MPN/Customer/Supplier Part No',
    'BOM Lines/Position',
    'BoM Lines/Display Name',
    'BoM Lines/Part Number',
    'BoM Lines/Description',
    'BoM Lines/Manufacturer',
    'BoM Lines/Product Unit of Measure',
    'BoM Lines/Quantity',
  ]

  const data = [headers]

  children.forEach((child, idx) => {
    const childCols = [
      child.findNo,
      child.itemId,
      child.manufacturerPartNo || '',
      child.itemName,
      child.manufacturer || '',
      child.uom,
      child.quantity,
    ]

    if (idx === 0) {
      data.push([parent.itemId, parent.itemId, '1', ...childCols])
    } else {
      data.push(['', '', '', ...childCols])
    }
  })

  const ws = xlsx.utils.aoa_to_sheet(data)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'BOM')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
```

- [ ] **Step 2: Commit**

```bash
git add server/services/excelGenerator.js
git commit -m "feat: Excel generator for Odoo product import and BOM import files"
```

---

## Task 7: Conversion Endpoint + Download Route

**Files:**
- Create: `server/routes/convert.js`
- Create: `server/routes/download.js`

- [ ] **Step 1: Write convert route**

Create `server/routes/convert.js`:
```js
import { Router } from 'express'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { parseFile } from '../services/fileParser.js'
import { extractBom } from '../services/aiExtractor.js'
import { generateProductImport, generateBomImport } from '../services/excelGenerator.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

const convertSchema = z.object({ customerId: z.string() })

router.post('/', upload.single('file'), async (req, res, next) => {
  const userId = req.user.id
  let customerId = null
  let originalFilename = req.file?.originalname || 'unknown'

  try {
    const { customerId: cid } = convertSchema.parse(req.body)
    customerId = cid

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const [customer, uomMappings] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
      prisma.unitOfMeasureMapping.findMany({ where: { customerId } }),
    ])

    logger.info(`Parsing file: ${req.file.path}`)
    const { rows, rawText } = await parseFile(req.file.path, req.file.mimetype)

    logger.info('Calling AI extractor...')
    const bomData = await extractBom(rawText, rows, customer, uomMappings)

    const { parent, children } = bomData
    if (!parent || !children?.length) {
      throw new Error('AI could not extract valid BOM data from the file')
    }

    const productBuffer = generateProductImport(parent, children)
    const bomBuffer = generateBomImport(parent, children)

    const jobId = uuid()
    const outputDir = path.join(process.env.UPLOAD_DIR || './uploads', 'output', jobId)
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, 'product-import.xlsx'), productBuffer)
    writeFileSync(path.join(outputDir, 'bom-import.xlsx'), bomBuffer)

    await prisma.conversionLog.create({
      data: {
        userId,
        customerId,
        originalFilename,
        status: 'SUCCESS',
        productsConverted: children.length + 1,
        bomsConverted: children.length,
      },
    })

    res.json({
      success: true,
      jobId,
      productsConverted: children.length + 1,
      bomsConverted: children.length,
      downloadUrls: {
        productImport: `/api/download/${jobId}/product-import.xlsx`,
        bomImport: `/api/download/${jobId}/bom-import.xlsx`,
      },
    })
  } catch (err) {
    logger.error('Conversion failed:', err)
    if (userId && customerId) {
      await prisma.conversionLog.create({
        data: { userId, customerId, originalFilename, status: 'FAILED', productsConverted: 0, bomsConverted: 0 },
      }).catch(() => {})
    }
    next(err)
  }
})

export default router
```

- [ ] **Step 2: Write download route**

Create `server/routes/download.js`:
```js
import { Router } from 'express'
import path from 'path'
import { existsSync } from 'fs'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params
  // Sanitise — allow only alphanumeric, hyphens, dots
  if (!/^[\w-]+$/.test(jobId) || !/^[\w.-]+\.xlsx$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid download path' })
  }
  const filePath = path.join(process.env.UPLOAD_DIR || './uploads', 'output', jobId, filename)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' })
  res.download(filePath, filename)
})

export default router
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/convert.js server/routes/download.js
git commit -m "feat: conversion pipeline endpoint and secure file download route"
```

---

## Task 8: Seed Data

**Files:**
- Create: `prisma/seed.js`

- [ ] **Step 1: Write seed script**

Create `prisma/seed.js`:
```js
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pecko.com' },
    update: {},
    create: { username: 'Admin', email: 'admin@pecko.com', passwordHash, role: 'ADMIN' },
  })

  const ks = await prisma.customer.upsert({
    where: { name: 'K&S' },
    update: {},
    create: {
      name: 'K&S',
      description: `This customer sends Excel files. The columns are:
Column A = Find No., Column B = Item ID, Column C = Item Name/Description,
Column D = Revision, Column E = Quantity, Column F = Unit of Measure,
Column G = Manufacturer, Column H = Manufacturer Part Number.
Row 1 is the header. Row 2 is the parent assembly part. Row 3 onwards are child/component parts.
Extract all rows including the parent. Apply UOM conversions as provided.`,
    },
  })

  await prisma.unitOfMeasureMapping.upsert({
    where: { customerId_customerUOM: { customerId: ks.id, customerUOM: 'EA' } },
    update: {},
    create: { customerId: ks.id, customerUOM: 'EA', peckoUOM: 'pcs', conversionFactor: 1 },
  })

  await prisma.unitOfMeasureMapping.upsert({
    where: { customerId_customerUOM: { customerId: ks.id, customerUOM: 'IN' } },
    update: {},
    create: { customerId: ks.id, customerUOM: 'IN', peckoUOM: 'm', conversionFactor: 0.0254 },
  })

  console.log('Seed complete. Admin:', admin.email, '| Customer:', ks.name)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Run seed**

```bash
node prisma/seed.js
```

Expected output:
```
Seed complete. Admin: admin@pecko.com | Customer: K&S
```

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.js
git commit -m "feat: seed script with admin user and K&S customer + UOM mappings"
```

---

## Task 9: Frontend Scaffolding

**Files:**
- Create: `client/` (Vite + React project)
- Create: `client/src/lib/api.js`
- Create: `client/src/contexts/AuthContext.jsx`
- Create: `client/src/hooks/useAuth.js`

- [ ] **Step 1: Scaffold Vite React project**

```bash
cd /path/to/pecko-bom-converter
npm create vite@latest client -- --template react
cd client
npm install
npm install axios react-router-dom react-hook-form @hookform/resolvers zod
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-toast @radix-ui/react-label @radix-ui/react-separator @radix-ui/react-slot
npm install lucide-react clsx tailwind-merge class-variance-authority
npm install -D tailwindcss postcss autoprefixer @tailwindcss/forms
npx tailwindcss init -p
```

- [ ] **Step 2: Configure Tailwind**

Replace `client/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b14',
          900: '#0d1526',
          800: '#111d36',
          700: '#1a2b4a',
          600: '#243b61',
        },
        electric: {
          500: '#2563eb',
          400: '#3b82f6',
          300: '#60a5fa',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: Update `client/src/index.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-navy-950 text-slate-100 font-sans;
  }
}
```

- [ ] **Step 4: Configure Vite proxy**

Update `client/vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 5: Create API client**

Create `client/src/lib/api.js`:
```js
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

let isRefreshing = false
let failedQueue = []

function processQueue(error) {
  failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve())
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then(() => api(original))
          .catch(e => Promise.reject(e))
      }
      original._retry = true
      isRefreshing = true
      try {
        await api.post('/auth/refresh')
        processQueue(null)
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr)
        window.location.href = '/login?expired=1'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
```

- [ ] **Step 6: Create AuthContext**

Create `client/src/contexts/AuthContext.jsx`:
```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 7: Commit**

```bash
cd client && git add . && cd ..
git commit -m "feat: frontend scaffold with Vite, Tailwind dark theme, axios + auth context"
```

---

## Task 10: App Router + Layout Components

**Files:**
- Create: `client/src/App.jsx`
- Create: `client/src/main.jsx`
- Create: `client/src/components/layout/ProtectedRoute.jsx`
- Create: `client/src/components/layout/AdminRoute.jsx`
- Create: `client/src/components/layout/Sidebar.jsx`
- Create: `client/src/components/layout/TopBar.jsx`
- Create: `client/src/components/layout/AppShell.jsx`

- [ ] **Step 1: main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 2: App.jsx**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import AdminRoute from '@/components/layout/AdminRoute'
import AppShell from '@/components/layout/AppShell'
import Login from '@/pages/Login'
import SetupAdmin from '@/pages/SetupAdmin'
import Dashboard from '@/pages/Dashboard'
import Convert from '@/pages/Convert'
import Users from '@/pages/settings/Users'
import Customers from '@/pages/settings/Customers'
import UnitOfMeasure from '@/pages/settings/UnitOfMeasure'
import Advanced from '@/pages/settings/Advanced'

export default function App() {
  const { loading } = useAuth()
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-navy-950">
      <div className="animate-spin w-8 h-8 border-4 border-electric-400 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<SetupAdmin />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/convert" element={<Convert />} />
          <Route element={<AdminRoute />}>
            <Route path="/settings/users" element={<Users />} />
            <Route path="/settings/customers" element={<Customers />} />
            <Route path="/settings/unit-of-measure" element={<UnitOfMeasure />} />
            <Route path="/settings/advanced" element={<Advanced />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 3: ProtectedRoute.jsx**

```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute() {
  const { user } = useAuth()
  return user ? <Outlet /> : <Navigate to="/login" replace />
}
```

- [ ] **Step 4: AdminRoute.jsx**

```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function AdminRoute() {
  const { user } = useAuth()
  return user?.role === 'ADMIN' ? <Outlet /> : <Navigate to="/dashboard" replace />
}
```

- [ ] **Step 5: Sidebar.jsx**

```jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, RefreshCw, Settings, Users, Building2, Ruler, SlidersHorizontal, LogOut, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItem = 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
const activeClass = 'bg-electric-500/20 text-electric-300'
const inactiveClass = 'text-slate-400 hover:bg-navy-700 hover:text-slate-100'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isAdmin = user?.role === 'ADMIN'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="w-64 min-h-screen bg-navy-900 border-r border-navy-700 flex flex-col">
      <div className="p-6 border-b border-navy-700">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Pecko</p>
        <h1 className="text-lg font-bold text-slate-100 mt-1">BOM Converter</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <NavLink to="/dashboard" className={({ isActive }) => cn(navItem, isActive ? activeClass : inactiveClass)}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>
        <NavLink to="/convert" className={({ isActive }) => cn(navItem, isActive ? activeClass : inactiveClass)}>
          <RefreshCw size={18} /> Convert BOM
        </NavLink>

        {isAdmin && (
          <div className="pt-4">
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className={cn(navItem, 'w-full justify-between', inactiveClass)}
            >
              <span className="flex items-center gap-3"><Settings size={18} /> Settings</span>
              <ChevronDown size={14} className={cn('transition-transform', settingsOpen && 'rotate-180')} />
            </button>
            {settingsOpen && (
              <div className="ml-4 mt-1 space-y-1">
                {[
                  { to: '/settings/users', icon: Users, label: 'Users' },
                  { to: '/settings/customers', icon: Building2, label: 'Customers' },
                  { to: '/settings/unit-of-measure', icon: Ruler, label: 'Unit of Measure' },
                  { to: '/settings/advanced', icon: SlidersHorizontal, label: 'Advanced' },
                ].map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => cn(navItem, isActive ? activeClass : inactiveClass)}>
                    <Icon size={16} /> {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-navy-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-electric-500/20 flex items-center justify-center text-electric-300 font-bold text-sm">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{user?.username}</p>
            <p className="text-xs text-slate-500 truncate">{user?.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className={cn(navItem, 'w-full', inactiveClass)}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: Create utils helper (needed by cn())**

Create `client/src/lib/utils.js`:
```js
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs) { return twMerge(clsx(inputs)) }
```

- [ ] **Step 7: TopBar.jsx**

```jsx
export default function TopBar({ title }) {
  return (
    <header className="h-14 bg-navy-900 border-b border-navy-700 flex items-center px-6">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
    </header>
  )
}
```

- [ ] **Step 8: AppShell.jsx**

```jsx
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/convert': 'Convert BOM',
  '/settings/users': 'Users',
  '/settings/customers': 'Customers',
  '/settings/unit-of-measure': 'Unit of Measure',
  '/settings/advanced': 'Advanced Settings',
}

export default function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar title={PAGE_TITLES[pathname] || 'Pecko BOM Converter'} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Commit**

```bash
git add client/src/
git commit -m "feat: app router, auth guards, sidebar + layout shell"
```

---

## Task 11: Login + SetupAdmin Pages

**Files:**
- Create: `client/src/pages/Login.jsx`
- Create: `client/src/pages/SetupAdmin.jsx`

- [ ] **Step 1: Login.jsx**

```jsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useState } from 'react'

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState(params.get('expired') ? 'Your session has expired. Please sign in again.' : '')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  async function onSubmit({ email, password }) {
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Sign in failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">Pecko</p>
          <h1 className="text-3xl font-bold text-slate-100">BOM Converter</h1>
          <p className="text-slate-400 mt-2 text-sm">Internal Production Tool</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-navy-900 border border-navy-700 rounded-xl p-8 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input {...register('email')} type="email" placeholder="you@pecko.com"
              className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <input {...register('password')} type="password"
              className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting}
            className="w-full bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: SetupAdmin.jsx**

```jsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useState } from 'react'

const schema = z.object({
  username: z.string().min(2, 'Name too short'),
  email: z.string().email(),
  password: z.string().min(8, 'Minimum 8 characters'),
})

export default function SetupAdmin() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  async function onSubmit(data) {
    try {
      await api.post('/setup', data)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed')
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">Pecko</p>
          <h1 className="text-2xl font-bold text-slate-100">Create Admin Account</h1>
          <p className="text-slate-400 mt-2 text-sm">First-time setup — this screen appears only once.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-navy-900 border border-navy-700 rounded-xl p-8 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          {[
            { name: 'username', label: 'Full Name', type: 'text', placeholder: 'Admin Name' },
            { name: 'email', label: 'Email', type: 'email', placeholder: 'admin@pecko.com' },
            { name: 'password', label: 'Password', type: 'password', placeholder: 'Min 8 characters' },
          ].map(({ name, label, type, placeholder }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
              <input {...register(name)} type={type} placeholder={placeholder}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
              {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name].message}</p>}
            </div>
          ))}

          <button type="submit" disabled={isSubmitting}
            className="w-full bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {isSubmitting ? 'Creating...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Login.jsx client/src/pages/SetupAdmin.jsx
git commit -m "feat: login and first-run admin setup pages"
```

---

## Task 12: Dashboard Page

**Files:**
- Create: `client/src/pages/Dashboard.jsx`

- [ ] **Step 1: Write Dashboard**

```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { FileSpreadsheet, FileCheck, Calendar, TrendingUp } from 'lucide-react'

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-100 font-mono mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  )
}

const STATUS_COLORS = { SUCCESS: 'text-green-400 bg-green-400/10', FAILED: 'text-red-400 bg-red-400/10' }

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="bg-navy-900 border border-navy-700 rounded-xl p-6">
        <p className="text-slate-400 text-sm">{today}</p>
        <h2 className="text-2xl font-bold text-slate-100 mt-1">
          Welcome back, {user?.username?.split(' ')[0]} 👋
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-navy-700 rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total BOMs Converted" value={stats?.totalBomsConverted} icon={FileSpreadsheet} color="bg-electric-500/20 text-electric-300" />
          <StatCard label="BOMs This Month" value={stats?.bomsThisMonth} icon={Calendar} color="bg-purple-500/20 text-purple-300" />
          <StatCard label="Total Products Converted" value={stats?.totalProductsConverted} icon={FileCheck} color="bg-emerald-500/20 text-emerald-300" />
          <StatCard label="Products This Month" value={stats?.productsThisMonth} icon={TrendingUp} color="bg-amber-500/20 text-amber-300" />
        </div>
      )}

      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-navy-700">
          <h3 className="font-semibold text-slate-100">Recent Activity</h3>
        </div>
        {!stats?.recentActivity?.length ? (
          <div className="p-12 text-center">
            <FileSpreadsheet size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">No conversions yet. Head to <strong>Convert BOM</strong> to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 border-b border-navy-700">
                  {['Date/Time', 'Customer', 'Filename', 'Products', 'BOMs', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentActivity.map((log, i) => (
                  <tr key={log.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{new Date(log.createdAt).toLocaleString('en-SG')}</td>
                    <td className="px-4 py-3 text-slate-200">{log.customer.name}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[180px] truncate">{log.originalFilename}</td>
                    <td className="px-4 py-3 text-slate-200 font-mono">{log.productsConverted}</td>
                    <td className="px-4 py-3 text-slate-200 font-mono">{log.bomsConverted}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[log.status]}`}>{log.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat: dashboard page with stats cards and recent activity table"
```

---

## Task 13: Convert BOM Page

**Files:**
- Create: `client/src/pages/Convert.jsx`

- [ ] **Step 1: Write Convert page**

```jsx
import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '@/lib/api'
import { useEffect } from 'react'
import { Upload, X, CheckCircle, AlertCircle, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_MESSAGES = [
  'Uploading file...',
  'Analysing BOM structure...',
  'Mapping columns...',
  'Generating export files...',
]

export default function Convert() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [file, setFile] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | loading | success | error
  const [statusIdx, setStatusIdx] = useState(0)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const intervalRef = useRef(null)

  useEffect(() => {
    api.get('/customers').then(res => setCustomers(res.data))
  }, [])

  const onDrop = useCallback(accepted => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxSize: 20 * 1024 * 1024,
  })

  function reset() {
    setFile(null)
    setSelectedCustomer('')
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    setStatusIdx(0)
  }

  async function handleConvert() {
    if (!selectedCustomer || !file) return
    setPhase('loading')
    setStatusIdx(0)
    intervalRef.current = setInterval(() => {
      setStatusIdx(i => Math.min(i + 1, STATUS_MESSAGES.length - 1))
    }, 2500)

    try {
      const form = new FormData()
      form.append('customerId', selectedCustomer)
      form.append('file', file)
      const res = await api.post('/convert', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      setPhase('success')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Conversion failed. Please try again.')
      setPhase('error')
    } finally {
      clearInterval(intervalRef.current)
    }
  }

  function handleDownload(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {phase === 'success' ? (
        <div className="bg-navy-900 border border-emerald-500/30 rounded-xl p-8 text-center space-y-4">
          <CheckCircle size={48} className="mx-auto text-emerald-400" />
          <h2 className="text-xl font-bold text-slate-100">Conversion Complete!</h2>
          <p className="text-slate-400">{result.productsConverted} products extracted &nbsp;|&nbsp; {result.bomsConverted} BOM lines extracted</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => handleDownload(result.downloadUrls.productImport, 'product-import.xlsx')}
              className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
              <Download size={16} /> Product Import File
            </button>
            <button onClick={() => handleDownload(result.downloadUrls.bomImport, 'bom-import.xlsx')}
              className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-100 px-5 py-2.5 rounded-lg font-medium transition-colors">
              <Download size={16} /> BOM Import File
            </button>
          </div>
          <button onClick={reset} className="text-slate-400 hover:text-slate-200 text-sm underline">Convert Another File</button>
        </div>
      ) : phase === 'error' ? (
        <div className="bg-navy-900 border border-red-500/30 rounded-xl p-8 text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-red-400" />
          <h2 className="text-xl font-bold text-slate-100">Conversion Failed</h2>
          <p className="text-red-400 text-sm">{errorMsg}</p>
          <button onClick={reset} className="bg-navy-700 hover:bg-navy-600 text-slate-100 px-5 py-2.5 rounded-lg font-medium transition-colors">Try Again</button>
        </div>
      ) : phase === 'loading' ? (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-12 text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-electric-400 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-300 font-medium">{STATUS_MESSAGES[statusIdx]}</p>
        </div>
      ) : (
        <>
          {/* Step 1 — Customer */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Step 1 — Select Customer</label>
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
              className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-electric-400">
              <option value="">Choose a customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Step 2 — Upload */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Step 2 — Upload BOM File</label>
            {file ? (
              <div className="flex items-center gap-3 bg-navy-800 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => setFile(null)}><X size={16} className="text-slate-400 hover:text-red-400" /></button>
              </div>
            ) : (
              <div {...getRootProps()} className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-electric-400 bg-electric-500/10' : 'border-navy-600 hover:border-navy-500'
              )}>
                <input {...getInputProps()} />
                <Upload size={32} className="mx-auto text-slate-500 mb-3" />
                <p className="text-slate-300 text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-slate-500 text-xs mt-1">Excel, PDF, PNG, JPG — max 20MB</p>
              </div>
            )}
          </div>

          {/* Step 3 — Convert */}
          <button onClick={handleConvert} disabled={!selectedCustomer || !file}
            className="w-full flex items-center justify-center gap-2 bg-electric-500 hover:bg-electric-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors text-base">
            <RefreshCw size={20} /> Convert to Pecko's Format
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Install react-dropzone**

```bash
cd client && npm install react-dropzone
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Convert.jsx
git commit -m "feat: BOM conversion page with drag-and-drop, progress states, and download buttons"
```

---

## Task 14: Settings Pages

**Files:**
- Create: `client/src/pages/settings/Users.jsx`
- Create: `client/src/pages/settings/Customers.jsx`
- Create: `client/src/pages/settings/UnitOfMeasure.jsx`
- Create: `client/src/pages/settings/Advanced.jsx`

- [ ] **Step 1: Users.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Plus, Edit2, Trash2, X, Users as UsersIcon } from 'lucide-react'

const schema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']),
})

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-900 border border-navy-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-navy-700">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function InputField({ label, error, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input {...props} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400" />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null) // null | { mode: 'create'|'edit', user?: obj }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() { setUsers((await api.get('/users')).data) }

  useEffect(() => { load() }, [])

  function openCreate() { reset({ username: '', email: '', password: '', role: 'USER' }); setModal({ mode: 'create' }) }
  function openEdit(u) { reset({ username: u.username, email: u.email, password: '', role: u.role }); setModal({ mode: 'edit', user: u }) }

  async function onSubmit(data) {
    try {
      if (modal.mode === 'create') {
        await api.post('/users', data)
        showToast('User created successfully')
      } else {
        const payload = { ...data }
        if (!payload.password) delete payload.password
        await api.put(`/users/${modal.user.id}`, payload)
        showToast('User updated')
      }
      setModal(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Error saving user')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      showToast('User deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}

      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-semibold">All Users</h3>
        <button onClick={openCreate} className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New User
        </button>
      </div>

      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        {!users.length ? (
          <div className="p-12 text-center"><UsersIcon size={36} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">No users yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-navy-800 border-b border-navy-700">
              {['Name', 'Email', 'Role', 'Created', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 text-slate-100">{u.username}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'ADMIN' ? 'bg-electric-500/20 text-electric-300' : 'bg-navy-700 text-slate-400'}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(u)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                    {u.id !== me?.id && <button onClick={() => setDeleteTarget(u)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'New User' : 'Edit User'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <InputField label="Full Name" {...register('username')} error={errors.username?.message} />
            <InputField label="Email" type="email" {...register('email')} error={errors.email?.message} />
            <InputField label={modal.mode === 'edit' ? 'New Password (leave blank to keep)' : 'Password'} type="password" {...register('password')} error={errors.password?.message} />
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
              <select {...register('role')} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400">
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 hover:bg-electric-400 text-white py-2 rounded-lg text-sm font-medium">
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete User" onClose={() => setDeleteTarget(null)}>
          <p className="text-slate-300 text-sm mb-4">Delete <strong>{deleteTarget.username}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Customers.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Edit2, Trash2, Building2, ArrowLeft } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  description: z.string().min(10, 'Describe the BOM format (min 10 chars)'),
})

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [view, setView] = useState('list') // 'list' | 'form'
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  async function load() { setCustomers((await api.get('/customers')).data) }
  useEffect(() => { load() }, [])

  function openCreate() { reset({ name: '', description: '' }); setEditTarget(null); setView('form') }
  function openEdit(c) { reset({ name: c.name, description: c.description }); setEditTarget(c); setView('form') }

  async function onSubmit(data) {
    try {
      if (editTarget) await api.put(`/customers/${editTarget.id}`, data)
      else await api.post('/customers', data)
      showToast(editTarget ? 'Customer updated' : 'Customer created')
      setView('list')
      load()
    } catch (err) { showToast(err.response?.data?.error || 'Save failed') }
  }

  async function handleDelete() {
    try {
      await api.delete(`/customers/${deleteTarget.id}`)
      showToast('Customer deleted')
      setDeleteTarget(null)
      load()
    } catch (err) { showToast(err.response?.data?.error || 'Delete failed') }
  }

  if (view === 'form') return (
    <div className="max-w-2xl">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-4">
        <ArrowLeft size={16} /> Back to customers
      </button>
      <h3 className="text-lg font-semibold text-slate-100 mb-6">{editTarget ? 'Edit Customer' : 'New Customer'}</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 bg-navy-900 border border-navy-700 rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Customer Name</label>
          <input {...register('name')} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400" />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">BOM Format Instructions</label>
          <p className="text-slate-500 text-xs mb-2">Describe column positions, header row, parent row, and any special rules. This is injected directly into the AI system prompt.</p>
          <textarea {...register('description')} rows={12}
            placeholder={`Example:\nThis customer sends Excel files with 8 columns.\nColumn A = Find No., Column B = Item ID, Column C = Item Name...\nRow 1 is the header. Row 2 is the parent assembly. Row 3+ are child components.`}
            className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400 resize-y" />
          {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setView('list')} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 hover:bg-electric-400 text-white py-2 rounded-lg text-sm font-medium">
            {isSubmitting ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </form>
    </div>
  )

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-semibold">Customers</h3>
        <button onClick={openCreate} className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> New Customer
        </button>
      </div>
      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        {!customers.length ? (
          <div className="p-12 text-center"><Building2 size={36} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">No customers yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-navy-800 border-b border-navy-700">
              {['Name', 'Created', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 text-slate-100 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(c)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                    <button onClick={() => setDeleteTarget(c)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 w-full max-w-sm">
            <p className="text-slate-300 text-sm mb-4">Delete customer <strong>{deleteTarget.name}</strong>? All associated UOM mappings and conversion logs will be removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: UnitOfMeasure.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Edit2, Trash2, Ruler } from 'lucide-react'

const mappingSchema = z.object({
  customerUOM: z.string().min(1, 'Required'),
  peckoUOM: z.string().min(1, 'Required'),
  conversionFactor: z.coerce.number().positive('Must be positive'),
})

export default function UnitOfMeasure() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [mappings, setMappings] = useState([])
  const [modal, setModal] = useState(null) // null | { mode, mapping? }
  const [toast, setToast] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(mappingSchema) })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => { api.get('/customers').then(r => setCustomers(r.data)) }, [])
  useEffect(() => {
    if (!selectedCustomer) return setMappings([])
    api.get(`/uom-mappings?customerId=${selectedCustomer}`).then(r => setMappings(r.data))
  }, [selectedCustomer])

  function openCreate() { reset({ customerUOM: '', peckoUOM: '', conversionFactor: 1 }); setModal({ mode: 'create' }) }
  function openEdit(m) { reset({ customerUOM: m.customerUOM, peckoUOM: m.peckoUOM, conversionFactor: m.conversionFactor }); setModal({ mode: 'edit', mapping: m }) }

  async function onSubmit(data) {
    try {
      if (modal.mode === 'create') {
        await api.post('/uom-mappings', { ...data, customerId: selectedCustomer })
        showToast('Mapping added')
      } else {
        await api.put(`/uom-mappings/${modal.mapping.id}`, { ...data, customerId: selectedCustomer })
        showToast('Mapping updated')
      }
      setModal(null)
      api.get(`/uom-mappings?customerId=${selectedCustomer}`).then(r => setMappings(r.data))
    } catch (err) { showToast(err.response?.data?.error || 'Save failed') }
  }

  async function handleDelete(id) {
    await api.delete(`/uom-mappings/${id}`)
    showToast('Mapping deleted')
    setMappings(m => m.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}

      <div className="bg-navy-900 border border-navy-700 rounded-xl p-5">
        <label className="block text-sm font-medium text-slate-300 mb-2">Select Customer</label>
        <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
          className="w-full max-w-sm bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400">
          <option value="">Choose a customer...</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selectedCustomer && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-100 font-semibold">UOM Mappings</h3>
            <button onClick={openCreate} className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={16} /> Add Mapping
            </button>
          </div>
          <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
            {!mappings.length ? (
              <div className="p-12 text-center"><Ruler size={36} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">No UOM mappings for this customer.</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-navy-800 border-b border-navy-700">
                  {['Customer UOM', 'Pecko UOM', 'Conversion Factor', 'Actions'].map(h =>
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {mappings.map((m, i) => (
                    <tr key={m.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                      <td className="px-4 py-3 font-mono text-slate-100">{m.customerUOM}</td>
                      <td className="px-4 py-3 font-mono text-electric-300">{m.peckoUOM}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">{m.conversionFactor}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => openEdit(m)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                        <button onClick={() => handleDelete(m.id)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl w-full max-w-sm">
            <div className="p-5 border-b border-navy-700 font-semibold text-slate-100">{modal.mode === 'create' ? 'Add Mapping' : 'Edit Mapping'}</div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              {[
                { name: 'customerUOM', label: 'Customer UOM', placeholder: 'e.g. EA' },
                { name: 'peckoUOM', label: "Pecko's UOM", placeholder: 'e.g. pcs' },
                { name: 'conversionFactor', label: 'Conversion Factor', type: 'number', step: 'any', placeholder: '1' },
              ].map(({ name, label, ...rest }) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
                  <input {...register(name)} {...rest} className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400" />
                  {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name].message}</p>}
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 text-white py-2 rounded-lg text-sm font-medium">{isSubmitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Advanced.jsx**

```jsx
import { SlidersHorizontal } from 'lucide-react'

export default function Advanced() {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center">
      <SlidersHorizontal size={48} className="text-slate-600 mb-4" />
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Advanced Settings</h2>
      <p className="text-slate-400 max-w-sm">Additional configuration options will be available here in a future update.</p>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/settings/
git commit -m "feat: settings pages — users, customers, UOM mappings, advanced placeholder"
```

---

## Task 15: README + Final Wiring

**Files:**
- Create: `README.md`

- [ ] **Step 1: README**

Create `README.md`:
```markdown
# Pecko BOM Converter

Internal web application for converting customer BOM files into Odoo v18-compatible import files.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- An Anthropic API key

## Setup

1. Clone and install dependencies:
   ```bash
   git clone ...
   npm install
   cd server && npm install
   cd ../client && npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env — fill in DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ANTHROPIC_API_KEY
   ```

3. Run database migrations:
   ```bash
   npx prisma migrate dev --schema=prisma/schema.prisma
   ```

4. Seed initial data (admin + K&S customer):
   ```bash
   node prisma/seed.js
   ```

5. Start development:
   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

## Default Login

- Email: `admin@pecko.com`
- Password: `Admin@123`

## First-time setup

If no admin account exists, visiting the app redirects to `/setup` where you create the initial admin.

## File Format Support

| Format | Method |
|--------|--------|
| `.xlsx` / `.xls` | SheetJS row parsing |
| `.pdf` | pdf-parse text extraction |
| `.png` / `.jpg` | Tesseract.js OCR |

## Project Structure

See the implementation plan in `docs/superpowers/plans/` for the complete file map.
```

- [ ] **Step 2: Add first-run redirect logic to App.jsx**

Modify `client/src/App.jsx` — wrap the app boot with a setup check:

Add this hook at the top of `App()` before the loading return:
```jsx
const [setupRequired, setSetupRequired] = useState(false)

useEffect(() => {
  api.get('/setup/status').then(r => {
    if (r.data.setupRequired) setSetupRequired(true)
  }).catch(() => {})
}, [])

if (setupRequired) return <Navigate to="/setup" replace />
```

Ensure `useEffect`, `useState`, and `Navigate` are imported.

- [ ] **Step 3: Final commit**

```bash
git add README.md client/src/App.jsx
git commit -m "feat: README, first-run setup redirect, project complete"
```

- [ ] **Step 4: Smoke test**

```bash
# Terminal 1 — start server
cd server && node index.js

# Terminal 2 — start client
cd client && npm run dev
```

1. Visit http://localhost:5173
2. Should redirect to `/setup` on first run — create admin
3. Log in with admin credentials
4. Verify dashboard loads with zero stats
5. Navigate to Settings → Customers — K&S should be present after seed
6. Go to Convert BOM → select K&S → upload a test Excel file → click Convert
7. Verify two download buttons appear on success

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|---|---|
| Prisma schema (User, Customer, UOMMapping, ConversionLog) | Task 1 |
| No public signup / admin-only user creation | Task 3 |
| First-run admin setup screen | Task 2 + 15 |
| JWT httpOnly cookies + refresh token | Task 2 |
| Login page with Pecko branding | Task 11 |
| Dashboard stats (4 cards) per user | Task 3 + 12 |
| Recent activity table (last 10) | Task 3 + 12 |
| Customer dropdown (searchable) on Convert | Task 13 |
| Drag-and-drop file upload | Task 13 |
| Loading spinner with 4 status messages | Task 13 |
| Claude AI column detection | Task 5 |
| UOM conversion applied | Task 5 |
| Product Import Excel (11 columns) | Task 6 |
| BOM Import Excel (10 columns, layout spec) | Task 6 |
| ConversionLog (SUCCESS + FAILED) | Task 7 |
| Download endpoints (secured) | Task 7 |
| Users CRUD (admin only) | Task 3 + 14 |
| Customers CRUD (full-page form) | Task 3 + 14 |
| UOM Mappings (per-customer, duplicate validation) | Task 3 + 14 |
| Advanced placeholder | Task 14 |
| Sidebar with admin-gated Settings | Task 10 |
| Dark navy/electric blue theme | Task 9 |
| DM Sans + JetBrains Mono fonts | Task 9 |
| Zod validation frontend + backend | All |
| File type + size validation (20MB) | Task 4 |
| MIME validation server-side | Task 4 |
| bcrypt 12 rounds | Task 2 |
| No passwords in API responses | Task 3 |
| 403 on /settings for non-admin | Task 3 |
| K&S seed data | Task 8 |
| .env.example | Task 1 |
| README | Task 15 |

All requirements covered. No placeholders remain.
