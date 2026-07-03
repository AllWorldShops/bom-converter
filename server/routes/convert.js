import { Router } from 'express'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { parseFile } from '../services/fileParser.js'
import { extractBom } from '../services/bomExtractor.js'
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
    const { rows } = await parseFile(req.file.path, req.file.mimetype)

    logger.info('Extracting BOM by column mapping...')
    const { parent, children } = extractBom(rows, customer)

    // UOM mapping (per-customer): replace the customer's unit with the Pecko unit and
    // scale quantity by the conversion factor. Case-insensitive.
    const uomLookup = new Map(uomMappings.map(m => [m.customerUOM.toUpperCase(), m]))
    function applyUomMapping(item) {
      if (!item.uom) return item
      const m = uomLookup.get(item.uom.toUpperCase())
      if (!m) return item
      const quantity = typeof item.quantity === 'number' ? item.quantity * m.conversionFactor : item.quantity
      return { ...item, uom: m.peckoUOM, quantity }
    }

    // Manufacturer mapping (global): case-insensitive customerManufacturer → peckoManufacturer
    const mfgLookup = new Map(
      manufacturerMappings.map(m => [m.customerManufacturer.toUpperCase(), m.peckoManufacturer])
    )
    function applyMfgMapping(item) {
      if (!item.manufacturer) return item
      const mapped = mfgLookup.get(item.manufacturer.toUpperCase())
      return mapped ? { ...item, manufacturer: mapped } : item
    }

    const mapItem = item => applyMfgMapping(applyUomMapping(item))
    const mappedParent = mapItem(parent)
    const mappedChildren = children.map(mapItem)

    // Build partNumber → externalId lookup from registry (itemName column stores part numbers)
    const registryMap = new Map(registryItems.map(r => [r.itemName, r.externalId]))

    const productBuffer = generateProductImport(mappedParent, mappedChildren, registryMap)
    const bomBuffer = generateBomImport(mappedParent, mappedChildren)

    const jobId = uuid()
    const outputDir = path.join(process.env.UPLOAD_DIR || './uploads', 'output', jobId)
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, 'product-import.xlsx'), productBuffer)
    writeFileSync(path.join(outputDir, 'bom-import.xlsx'), bomBuffer)

    // Auto-register new products discovered in this BOM (fire and forget)
    // Only saves items not already in registry; each upsert is independent so one failure won't block others
    ;(async () => {
      const allItems = [mappedParent, ...mappedChildren]
      const seen = new Set()
      for (const item of allItems) {
        const name = item.itemId?.trim()
        if (!name || seen.has(name) || registryMap.has(name)) continue
        seen.add(name)
        try {
          await prisma.productRegistry.upsert({
            where: { itemName: name },
            update: {},  // already in registry — no change needed
            create: {
              itemName: name,
              externalId: `__export__.product_template_${item.itemId}`,
            },
          })
        } catch (err) {
          logger.error(`Registry auto-register failed for "${name}":`, err)
        }
      }
    })()

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
