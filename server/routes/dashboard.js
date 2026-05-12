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

    const [totalLogs, thisMonthLogs, recentLogs] = await Promise.all([
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
