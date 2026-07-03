import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { searchParts } from '../services/partSourcing.js'

const router = Router()
router.use(requireAuth)

const querySchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters'),
  exact: z.enum(['true', 'false']).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  currency: z.string().length(3).optional(),
})

// GET /api/part-sourcing/search?q=193643-1&exact=false&inStock=false&currency=USD
router.get('/search', async (req, res, next) => {
  try {
    const { q, exact, inStock, currency } = querySchema.parse(req.query)
    const result = await searchParts(q, {
      exactMatch: exact === 'true',
      inStockOnly: inStock === 'true',
      currency,
    })
    res.json(result)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

export default router
