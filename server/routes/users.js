import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const userSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'USER']),
})

const select = { id: true, username: true, email: true, role: true, createdAt: true }

router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.user.findMany({ select, orderBy: { createdAt: 'desc' } }))
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const { username, email, password, role } = userSchema.parse(req.body)
    if (!password) return res.status(400).json({ error: 'Password is required for new users' })
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { username, email, passwordHash, role }, select })
    res.status(201).json(user)
  } catch (err) { next(err) }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { username, email, password, role } = userSchema.parse(req.body)
    const data = { username, email, role }
    if (password) data.passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select })
    res.json(user)
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' })
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
