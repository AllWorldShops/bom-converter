import { Router } from 'express'
import { z } from 'zod'
import xlsx from 'xlsx'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'
import { importUpload } from '../middleware/upload.js'

const router = Router()
router.use(requireAuth)

const registrySchema = z.object({
  itemName: z.string().min(1, 'Item Name is required'),
  externalId: z.string().min(1, 'External ID is required'),
})

// GET /api/product-registry — paginated search by itemName
router.get('/', async (req, res, next) => {
  try {
    const search = req.query.search?.trim() || ''
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const skip = (page - 1) * limit

    const where = search
      ? { itemName: { contains: search } }
      : {}

    const [total, items] = await Promise.all([
      prisma.productRegistry.count({ where }),
      prisma.productRegistry.findMany({ where, skip, take: limit, orderBy: { itemName: 'asc' } }),
    ])

    res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err) { next(err) }
})

// GET /api/product-registry/template — download blank Excel template
router.get('/template', (req, res) => {
  const wb = xlsx.utils.book_new()
  const ws = xlsx.utils.aoa_to_sheet([
    ['External ID', 'Item Name'],
    ['__export__.product_template_12345', 'Widget Assembly'],
  ])
  ws['!cols'] = [{ wch: 40 }, { wch: 50 }]
  xlsx.utils.book_append_sheet(wb, ws, 'Product Registry')
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="product-registry-template.xlsx"',
  })
  res.send(buffer)
})

// POST /api/product-registry/import — bulk upsert from Excel/CSV
// Col A = externalId, Col B = itemName
router.post('/import', importUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const wb = xlsx.read(req.file.buffer, { type: 'buffer' })
    if (!wb.SheetNames.length || !wb.Sheets[wb.SheetNames[0]]) {
      return res.status(400).json({ error: 'Could not read the uploaded file. Ensure it is a valid Excel or CSV file.' })
    }
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    const dataRows = rows.slice(1) // skip header

    if (dataRows.length === 0) {
      return res.status(400).json({ error: 'No valid data rows found. Ensure Column A = External ID, Column B = Item Name.' })
    }

    let imported = 0
    let skipped = 0

    for (const row of dataRows) {
      const externalId = String(row[0] ?? '').trim()
      const itemName = String(row[1] ?? '').trim()
      if (!externalId || !itemName) { skipped++; continue }

      await prisma.productRegistry.upsert({
        where: { itemName },
        update: { externalId },
        create: { itemName, externalId },
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
    if (err.code === 'P2002') return res.status(409).json({ error: 'An entry for this Item Name already exists' })
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
