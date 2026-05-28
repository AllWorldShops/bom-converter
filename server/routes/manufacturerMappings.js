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
  customerManufacturer: z.string().min(1, 'Customer manufacturer name is required'),
  peckoManufacturer: z.string().min(1, 'ERP manufacturer name is required'),
})

// GET /api/manufacturer-mappings — list all global mappings
router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.manufacturerMapping.findMany({ orderBy: { customerManufacturer: 'asc' } }))
  } catch (err) { next(err) }
})

// GET /api/manufacturer-mappings/template — download blank Excel template
router.get('/template', (req, res) => {
  const wb = xlsx.utils.book_new()
  const ws = xlsx.utils.aoa_to_sheet([
    ['Pecko ERP Name', 'Customer Alias'],
    ['Zebra Technologies', 'ZEBRA'],
    ['Amp/Tyco/ TE Connectivity', 'TYCO ELECTRONICS'],
    ['Alpha', 'ALPHA'],
  ])
  ws['!cols'] = [{ wch: 35 }, { wch: 35 }]
  xlsx.utils.book_append_sheet(wb, ws, 'Manufacturers')
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="manufacturer-mapping-template.xlsx"',
  })
  res.send(buffer)
})

// POST /api/manufacturer-mappings/import — bulk upsert from CSV or Excel
router.post('/import', importUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const wb = xlsx.read(req.file.buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    // Skip the header row (row 0), process from row 1 onwards
    const dataRows = rows.slice(1).filter(r => String(r[0]).trim() && String(r[1]).trim())

    if (dataRows.length === 0) {
      return res.status(400).json({ error: 'No valid data rows found. Ensure Column A = ERP Name, Column B = Customer Alias.' })
    }

    let imported = 0
    let skipped = 0

    for (const row of dataRows) {
      const peckoManufacturer = String(row[0]).trim()
      const customerManufacturer = String(row[1]).trim()
      if (!peckoManufacturer || !customerManufacturer) { skipped++; continue }

      await prisma.manufacturerMapping.upsert({
        where: { customerManufacturer },
        update: { peckoManufacturer },
        create: { customerManufacturer, peckoManufacturer },
      })
      imported++
    }

    res.json({ imported, skipped })
  } catch (err) { next(err) }
})

// POST /api/manufacturer-mappings — create single mapping
router.post('/', async (req, res, next) => {
  try {
    const data = mappingSchema.parse(req.body)
    res.status(201).json(await prisma.manufacturerMapping.create({ data }))
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A mapping for this customer alias already exists' })
    next(err)
  }
})

// PUT /api/manufacturer-mappings/:id — update single mapping
router.put('/:id', async (req, res, next) => {
  try {
    const { customerManufacturer, peckoManufacturer } = mappingSchema.parse(req.body)
    res.json(await prisma.manufacturerMapping.update({
      where: { id: req.params.id },
      data: { customerManufacturer, peckoManufacturer },
    }))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Mapping not found' })
    if (err.code === 'P2002') return res.status(409).json({ error: 'A mapping for this customer alias already exists' })
    next(err)
  }
})

// DELETE /api/manufacturer-mappings/:id — delete single mapping
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.manufacturerMapping.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Mapping not found' })
    next(err)
  }
})

export default router
