import { Router } from 'express'
import express from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { importUpload } from '../middleware/upload.js'
import { parseRfqWorkbook } from '../services/rfqParser.js'
import { logger } from '../lib/logger.js'

const router = Router()

// Sync accepts two callers:
//  - a logged-in user clicking "Sync Now" (multipart file upload, JWT auth)
//  - the Power Automate daily flow (raw .xlsx bytes + shared secret header, no JWT)
function rfqSyncAuth(req, res, next) {
  const secret = process.env.RFQ_SYNC_SECRET
  const provided = req.get('x-rfq-secret')
  if (secret && provided && provided === secret) {
    req.syncSource = 'webhook'
    return next()
  }
  req.syncSource = 'upload'
  return requireAuth(req, res, next)
}

// Raw parser for the webhook path; multipart requests pass straight through untouched.
const rawXlsx = express.raw({
  type: ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  limit: '25mb',
})

router.post('/sync', rfqSyncAuth, rawXlsx, importUpload.single('file'), async (req, res, next) => {
  try {
    const buffer = req.file?.buffer || (Buffer.isBuffer(req.body) && req.body.length ? req.body : null)
    if (!buffer) return res.status(400).json({ error: 'No file received' })

    const { rows, stats } = await parseRfqWorkbook(buffer)
    const syncedAt = new Date()

    // Full replace: the sheet is the source of truth.
    await prisma.$transaction([
      prisma.rfqProject.deleteMany({}),
      prisma.rfqProject.createMany({
        data: rows.map(r => ({
          rowNumber: r.rowNumber,
          projectId: r.projectId,
          customer: r.customer,
          linkSource: r.linkSource,
          pic: r.pic,
          projectType: r.projectType,
          notes: r.notes,
          rfqDueDateRaw: r.rfqDueDateRaw,
          rfqDueDate: r.rfqDueDate,
          rfqReceivedDateRaw: r.rfqReceivedDateRaw,
          sofeaDateRaw: r.sofeaDateRaw,
          submissionDateRaw: r.submissionDateRaw,
          status: r.status,
          syncedAt,
        })),
      }),
      prisma.rfqSync.create({
        data: {
          syncedAt,
          source: req.syncSource,
          total: stats.total,
          completed: stats.completed,
          pendingReview: stats.pendingReview,
          other: stats.other,
          none: stats.none,
        },
      }),
    ])

    logger.info(`RFQ sync (${req.syncSource}): ${stats.total} rows, ${stats.pendingReview} pending review`)
    res.json({ success: true, stats, syncedAt })
  } catch (err) {
    logger.error('RFQ sync failed:', err)
    next(err)
  }
})

// Status ordering for display: action-required first.
const STATUS_RANK = { PENDING_REVIEW: 0, OTHER: 1, NONE: 2, COMPLETED: 3 }

router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const { status, customer, q } = req.query
    const where = {}
    if (status) where.status = String(status)
    if (customer) where.customer = String(customer)

    // ponytail: ~900 rows — fetch matching set and do free-text filter + custom sort in JS.
    // If this ever grows past a few thousand rows, push search/sort into SQL.
    let rows = await prisma.rfqProject.findMany({ where })
    if (q) {
      const needle = String(q).toLowerCase()
      rows = rows.filter(r =>
        r.projectId.toLowerCase().includes(needle) ||
        r.customer.toLowerCase().includes(needle) ||
        r.notes.toLowerCase().includes(needle)
      )
    }
    rows.sort((a, b) => {
      const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
      if (s !== 0) return s
      const ad = a.rfqDueDate ? new Date(a.rfqDueDate).getTime() : Infinity
      const bd = b.rfqDueDate ? new Date(b.rfqDueDate).getTime() : Infinity
      if (ad !== bd) return ad - bd
      return a.rowNumber - b.rowNumber
    })
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const [lastSync, all] = await Promise.all([
      prisma.rfqSync.findFirst({ orderBy: { syncedAt: 'desc' } }),
      prisma.rfqProject.findMany({ select: { customer: true, projectType: true, status: true } }),
    ])
    const counts = { total: all.length, completed: 0, pendingReview: 0, other: 0, none: 0 }
    for (const r of all) {
      if (r.status === 'COMPLETED') counts.completed++
      else if (r.status === 'PENDING_REVIEW') counts.pendingReview++
      else if (r.status === 'OTHER') counts.other++
      else counts.none++
    }
    const customers = [...new Set(all.map(r => r.customer).filter(Boolean))].sort()
    const projectTypes = [...new Set(all.map(r => r.projectType).filter(Boolean))].sort()
    res.json({
      counts,
      customers,
      projectTypes,
      lastSyncedAt: lastSync?.syncedAt ?? null,
      lastSource: lastSync?.source ?? null,
    })
  } catch (err) { next(err) }
})

export default router
