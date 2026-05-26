import { Router } from 'express'
import { z } from 'zod'
import xlsx from 'xlsx'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'
import { importUpload } from '../middleware/upload.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const registrySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  itemName: z.string().optional(),
  uom: z.string().optional(),
})

// GET /api/product-registry — paginated search
router.get('/', async (req, res, next) => {
  try {
    const search = req.query.search?.trim() || ''
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
    const skip = (page - 1) * limit

    const where = search
      ? { OR: [
          { itemId: { contains: search } },
          { itemName: { contains: search } },
        ]}
      : {}

    const [total, items] = await Promise.all([
      prisma.productRegistry.count({ where }),
      prisma.productRegistry.findMany({ where, skip, take: limit, orderBy: { itemId: 'asc' } }),
    ])

    res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err) { next(err) }
})

// GET /api/product-registry/template — download blank Excel template
router.get('/template', (req, res) => {
  const wb = xlsx.utils.book_new()
  const ws = xlsx.utils.aoa_to_sheet([
    ['Item ID', 'Item Name', 'UOM'],
    ['PART-001', 'Widget Assembly', 'EA'],
  ])
  ws['!cols'] = [{ wch: 25 }, { wch: 40 }, { wch: 10 }]
  xlsx.utils.book_append_sheet(wb, ws, 'Product Registry')
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="product-registry-template.xlsx"',
  })
  res.send(buffer)
})

// POST /api/product-registry/import — bulk upsert from CSV or Excel
router.post('/import', importUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const wb = xlsx.read(req.file.buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    let imported = 0
    let skipped = 0

    for (const row of rows.slice(1)) {
      const itemId = String(row[0] ?? '').trim()
      if (!itemId) { skipped++; continue }

      const itemName = String(row[1] ?? '').trim() || null
      const uom = String(row[2] ?? '').trim() || null

      await prisma.productRegistry.upsert({
        where: { itemId },
        update: { itemName, uom },
        create: { itemId, itemName, uom },
      })
      imported++
    }

    res.json({ imported, skipped })
  } catch (err) { next(err) }
})

// POST /api/product-registry — create single entry
router.post('/', async (req, res, next) => {
  try {
    const data = registrySchema.parse(req.body)
    res.status(201).json(await prisma.productRegistry.create({ data }))
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An entry for this Item ID already exists' })
    next(err)
  }
})

// DELETE /api/product-registry/:id — delete by id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.productRegistry.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entry not found' })
    next(err)
  }
})

export default router
