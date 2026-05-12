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
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
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
