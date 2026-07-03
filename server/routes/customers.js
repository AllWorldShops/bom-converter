import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'

const router = Router()
router.use(requireAuth)

const columnLetter = z.string().trim().regex(/^[A-Za-z]{0,3}$/, 'Use a column letter (A, B, C…)')
const customerSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  columnMapping: z.object({
    headerRow: z.coerce.number().int().min(1),
    parentRow: z.coerce.number().int().min(1),
    childStartRow: z.coerce.number().int().min(1),
    columns: z.object({
      findNo: columnLetter,
      itemId: z.string().trim().regex(/^[A-Za-z]{1,3}$/, 'Item ID column is required'),
      itemName: columnLetter,
      revision: columnLetter,
      quantity: columnLetter,
      uom: columnLetter,
      manufacturer: columnLetter,
      manufacturerPartNo: columnLetter,
    }),
  }),
})

// Zod-validated body -> Prisma data (column mapping stored as a JSON string).
function toData(body) {
  const parsed = customerSchema.parse(body)
  return {
    name: parsed.name,
    description: parsed.description,
    columnMapping: JSON.stringify(parsed.columnMapping),
  }
}

// GET all — available to all authenticated users (needed for Convert dropdown)
router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.customer.findMany({ orderBy: { name: 'asc' } }))
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    res.json(customer)
  } catch (err) { next(err) }
})

// Write operations — admin only
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await prisma.customer.create({ data: toData(req.body) }))
  } catch (err) { next(err) }
})

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    res.json(await prisma.customer.update({ where: { id: req.params.id }, data: toData(req.body) }))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Customer not found' })
    next(err)
  }
})

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Customer not found' })
    next(err)
  }
})

export default router
