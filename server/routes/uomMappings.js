import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const mappingSchema = z.object({
  customerId: z.string().min(1),
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
    const { customerId, customerUOM, peckoUOM, conversionFactor } = mappingSchema.parse(req.body)
    res.json(await prisma.unitOfMeasureMapping.update({
      where: { id: req.params.id },
      data: { customerId, customerUOM, peckoUOM, conversionFactor },
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
