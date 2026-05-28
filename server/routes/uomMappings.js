import { Router } from 'express'
import { z } from 'zod'
import xlsx from 'xlsx'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'
import { importUpload } from '../middleware/upload.js'

const router = Router()
router.use(requireAuth)

const mappingSchema = z.object({
  customerId: z.string().min(1),
  customerUOM: z.string().min(1),
  peckoUOM: z.string().min(1),
  conversionFactor: z.number().positive(),
})

// GET /api/uom-mappings — list mappings, optionally filtered by customerId
router.get('/', async (req, res, next) => {
  try {
    const { customerId } = req.query
    const where = customerId ? { customerId } : {}
    res.json(await prisma.unitOfMeasureMapping.findMany({ where, orderBy: { customerUOM: 'asc' } }))
  } catch (err) { next(err) }
})

// GET /api/uom-mappings/template — download blank Excel template
router.get('/template', (req, res) => {
  const wb = xlsx.utils.book_new()
  const ws = xlsx.utils.aoa_to_sheet([
    ['Customer UOM', 'Pecko UOM', 'Conversion Factor'],
    ['EA', 'pcs', '1'],
    ['MTR', 'm', '1'],
    ['FT', 'm', '0.3048'],
  ])
  ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }]
  xlsx.utils.book_append_sheet(wb, ws, 'UOM Mappings')
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="uom-mapping-template.xlsx"',
  })
  res.send(buffer)
})

// POST /api/uom-mappings/import — bulk upsert from CSV or Excel
router.post('/import', importUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const { customerId } = req.body
    if (!customerId) return res.status(400).json({ error: 'customerId is required' })

    const wb = xlsx.read(req.file.buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    // Skip the header row, process from row 1 onwards
    const dataRows = rows.slice(1).filter(r => String(r[0]).trim() && String(r[1]).trim())

    if (dataRows.length === 0) {
      return res.status(400).json({ error: 'No valid data rows found. Ensure Column A = Customer UOM, Column B = Pecko UOM.' })
    }

    let imported = 0
    let skipped = 0

    for (const row of dataRows) {
      const customerUOM = String(row[0]).trim()
      const peckoUOM = String(row[1]).trim()
      const conversionFactor = parseFloat(row[2]) || 1

      if (!customerUOM || !peckoUOM || conversionFactor <= 0) { skipped++; continue }

      await prisma.unitOfMeasureMapping.upsert({
        where: { customerId_customerUOM: { customerId, customerUOM } },
        update: { peckoUOM, conversionFactor },
        create: { customerId, customerUOM, peckoUOM, conversionFactor },
      })
      imported++
    }

    res.json({ imported, skipped })
  } catch (err) { next(err) }
})

// POST /api/uom-mappings — create single mapping
router.post('/', async (req, res, next) => {
  try {
    const data = mappingSchema.parse(req.body)
    res.status(201).json(await prisma.unitOfMeasureMapping.create({ data }))
  } catch (err) { next(err) }
})

// PUT /api/uom-mappings/:id — update single mapping
router.put('/:id', async (req, res, next) => {
  try {
    const { customerId, customerUOM, peckoUOM, conversionFactor } = mappingSchema.parse(req.body)
    res.json(await prisma.unitOfMeasureMapping.update({
      where: { id: req.params.id },
      data: { customerId, customerUOM, peckoUOM, conversionFactor },
    }))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Mapping not found' })
    next(err)
  }
})

// DELETE /api/uom-mappings/:id — delete single mapping
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.unitOfMeasureMapping.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Mapping not found' })
    next(err)
  }
})

export default router
