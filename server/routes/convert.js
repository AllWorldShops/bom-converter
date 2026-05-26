import { Router } from 'express'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { parseFile } from '../services/fileParser.js'
import { extractBom } from '../services/aiExtractor.js'
import { generateProductImport, generateBomImport } from '../services/excelGenerator.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

const convertSchema = z.object({ customerId: z.string().min(1) })

router.post('/', upload.single('file'), async (req, res, next) => {
  const userId = req.user.id
  // Best-effort extraction before validation, so FAILED log can reference the customer
  let customerId = req.body?.customerId ?? null
  let originalFilename = req.file?.originalname || 'unknown'

  try {
    const { customerId: cid } = convertSchema.parse(req.body)
    customerId = cid  // overwrite with validated value

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const [customer, uomMappings, manufacturerMappings, registryItems] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.unitOfMeasureMapping.findMany({ where: { customerId } }),
      prisma.manufacturerMapping.findMany(),
      prisma.productRegistry.findMany({ select: { itemName: true, externalId: true } }),
    ])

    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    logger.info(`Parsing file: ${req.file.path}`)
    const { rows, rawText } = await parseFile(req.file.path, req.file.mimetype)

    logger.info('Calling AI extractor...')
    const bomData = await extractBom(rawText, rows, customer, uomMappings)

    const { parent, children } = bomData
    if (!parent || !Array.isArray(children) || children.length === 0) {
      throw new Error('AI could not extract valid BOM data from the file')
    }

    // Build a case-insensitive lookup map: uppercase(customerManufacturer) → peckoManufacturer
    const mfgLookup = new Map(
      manufacturerMappings.map(m => [m.customerManufacturer.toUpperCase(), m.peckoManufacturer])
    )

    function applyMfgMapping(item) {
      if (!item.manufacturer) return item
      const mapped = mfgLookup.get(item.manufacturer.toUpperCase())
      return mapped ? { ...item, manufacturer: mapped } : item
    }

    const mappedParent = applyMfgMapping(parent)
    const mappedChildren = children.map(applyMfgMapping)

    // Build itemName → externalId lookup from registry
    const registryMap = new Map(registryItems.map(r => [r.itemName, r.externalId]))

    const productBuffer = generateProductImport(mappedParent, mappedChildren, registryMap)
    const bomBuffer = generateBomImport(mappedParent, mappedChildren)

    const jobId = uuid()
    const outputDir = path.join(process.env.UPLOAD_DIR || './uploads', 'output', jobId)
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, 'product-import.xlsx'), productBuffer)
    writeFileSync(path.join(outputDir, 'bom-import.xlsx'), bomBuffer)

    // Auto-register new products discovered in this BOM (fire and forget)
    // For each item: if not in registry, save it with the generated externalId
    const allItems = [mappedParent, ...mappedChildren]
    const seen = new Set()
    const newItems = allItems.filter(item => {
      if (seen.has(item.itemName) || registryMap.has(item.itemName)) return false
      seen.add(item.itemName)
      return true
    })
    if (newItems.length > 0) {
      prisma.$transaction(
        newItems.map(item =>
          prisma.productRegistry.create({
            data: {
              itemName: item.itemName,
              externalId: `__export__.product_template_${item.itemId}`,
            },
          })
        )
      ).catch(err => logger.error('Registry auto-register failed:', err))
    }

    await prisma.conversionLog.create({
      data: {
        userId,
        customerId,
        originalFilename,
        status: 'SUCCESS',
        productsConverted: children.length + 1,
        bomsConverted: 1,
      },
    })

    res.json({
      success: true,
      jobId,
      productsConverted: children.length + 1,
      bomsConverted: 1,
      downloadUrls: {
        productImport: `/api/download/${jobId}/product-import.xlsx`,
        bomImport: `/api/download/${jobId}/bom-import.xlsx`,
      },
    })
  } catch (err) {
    logger.error('Conversion failed:', err)
    if (userId) {
      prisma.conversionLog.create({
        data: {
          userId,
          customerId,
          originalFilename,
          status: 'FAILED',
          productsConverted: 0,
          bomsConverted: 0,
        },
      }).catch(() => {})
    }
    next(err)
  }
})

export default router
