import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import { ZodError } from 'zod'
import { logger } from './lib/logger.js'
import authRouter from './routes/auth.js'
import setupRouter from './routes/setup.js'
import usersRouter from './routes/users.js'
import customersRouter from './routes/customers.js'
import uomRouter from './routes/uomMappings.js'
import dashboardRouter from './routes/dashboard.js'
import convertRouter from './routes/convert.js'
import downloadRouter from './routes/download.js'

const app = express()

const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173'
if (allowedOrigin === '*') {
  throw new Error('CLIENT_URL must be a specific origin, not a wildcard')
}

app.use(cors({ origin: allowedOrigin, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/setup', setupRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/customers', customersRouter)
app.use('/api/uom-mappings', uomRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/convert', convertRouter)
app.use('/api/download', downloadRouter)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.startsWith('Unsupported file type')) {
    return res.status(400).json({ error: err.message })
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.errors })
  }
  logger.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`))

export default app
