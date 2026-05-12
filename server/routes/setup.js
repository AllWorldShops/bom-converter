import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../lib/prisma.js'

const router = Router()

// Returns whether an admin exists — used by frontend to decide whether to show Setup screen
router.get('/status', async (req, res, next) => {
  try {
    const count = await prisma.user.count({ where: { role: 'ADMIN' } })
    res.json({ setupRequired: count === 0 })
  } catch (err) {
    next(err)
  }
})

const setupSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

router.post('/', async (req, res, next) => {
  try {
    const { username, email, password } = setupSchema.parse(req.body)
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count({ where: { role: 'ADMIN' } })
      if (count > 0) {
        const err = new Error('Setup already completed')
        err.status = 403
        throw err
      }
      return tx.user.create({
        data: { username, email, passwordHash, role: 'ADMIN' },
        select: { id: true, username: true, email: true, role: true },
      })
    })

    res.status(201).json({ user })
  } catch (err) {
    next(err)
  }
})

export default router
