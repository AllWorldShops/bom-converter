import ExcelJS from 'exceljs'

// Status is encoded as the row's fill color in the "PENDING PROJECT" master sheet.
// Decoded from the sheet's own legend (row 1): theme accent2 (#ED7D31, orange) = Pending Review,
// theme accent6 (#70AD47, green) = Completed. We key on the theme INDEX (5 / 9) so it survives the
// user lightening/darkening the shade, with an RGB-hue fallback for cells colored by direct hex.
export const STATUS = {
  COMPLETED: 'COMPLETED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  OTHER: 'OTHER',
  NONE: 'NONE',
}

// Known header labels -> canonical field. Matched case-insensitively against row 1 so inserted/renamed
// columns don't silently shift the mapping. `null` fields (RFQ#, Link) are read but not stored.
const HEADER_MAP = [
  { field: 'projectId', match: ['project id'] },
  { field: 'linkSource', match: ['link source'] },
  { field: 'rfqDueDate', match: ['rfq due date', 'rfq due date2'] },
  { field: 'rfqReceivedDate', match: ['rfq received date'] },
  { field: 'sofeaDate', match: ['sofea date', 'sofea'] },
  { field: 'customer', match: ['customer'] },
  { field: 'pic', match: ['pic'] },
  { field: 'projectType', match: ['project type'] },
  { field: 'notes', match: ['notes'] },
  { field: 'submissionDate', match: ['submission date'] },
]

const norm = v => String(v ?? '').trim().toLowerCase()

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return String(v.text ?? v.result ?? v.hyperlink ?? '').trim()
  return String(v).trim()
}

function toDate(cell) {
  const v = cell.value
  if (v instanceof Date) return v
  const t = cellText(cell)
  if (!t) return null
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : d
}

function classifyFill(fgColor) {
  if (!fgColor) return null
  if (fgColor.theme === 9) return 'green'
  if (fgColor.theme === 5) return 'orange'
  if (fgColor.argb) {
    const hex = fgColor.argb.slice(-6)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if (g > r && g > b) return 'green'
    if (r > 180 && g > 120 && b < 120) return 'orange'
  }
  return 'other'
}

// A row's status = the dominant fill across its data cells (we skip the Project ID column, which
// carries its own accent styling unrelated to status).
function rowStatus(row, dataCols, projectIdCol) {
  let green = 0, orange = 0, other = 0
  for (const c of dataCols) {
    if (c === projectIdCol) continue
    const f = row.getCell(c).fill
    if (!(f && f.type === 'pattern' && f.fgColor)) continue
    const kind = classifyFill(f.fgColor)
    if (kind === 'green') green++
    else if (kind === 'orange') orange++
    else if (kind === 'other') other++
  }
  if (green === 0 && orange === 0 && other === 0) return STATUS.NONE
  if (orange > green) return STATUS.PENDING_REVIEW
  if (green > 0) return STATUS.COMPLETED
  return STATUS.OTHER
}

function findHeaderRow(ws) {
  // Header is row 1 in the known file, but locate it by content to stay robust.
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const texts = []
    for (let c = 1; c <= ws.columnCount; c++) texts.push(norm(ws.getRow(r).getCell(c).value))
    if (texts.includes('project id') && texts.includes('customer')) return r
  }
  return 1
}

/**
 * Parse a "PENDING PROJECT" workbook buffer into structured RFQ rows.
 * @param {Buffer} buffer - raw .xlsx bytes
 * @returns {Promise<{ rows: object[], stats: object }>}
 */
export async function parseRfqWorkbook(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Workbook has no sheets')

  const headerRow = findHeaderRow(ws)
  const header = ws.getRow(headerRow)

  // Build field -> column index from the header labels.
  const colOf = {}
  for (let c = 1; c <= ws.columnCount; c++) {
    const label = norm(header.getCell(c).value)
    if (!label) continue
    for (const { field, match } of HEADER_MAP) {
      if (!colOf[field] && match.includes(label)) colOf[field] = c
    }
  }
  if (!colOf.projectId || !colOf.customer) {
    throw new Error('Could not find "Project ID" / "Customer" columns — is this the RFQ master sheet?')
  }

  const dataCols = Object.values(colOf)
  const rows = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const projectId = cellText(row.getCell(colOf.projectId))
    const customer = colOf.customer ? cellText(row.getCell(colOf.customer)) : ''
    if (!projectId && !customer) continue // skip fully-blank spacer rows

    const rfqDueCell = colOf.rfqDueDate ? row.getCell(colOf.rfqDueDate) : null
    rows.push({
      rowNumber: r,
      projectId,
      customer,
      linkSource: colOf.linkSource ? cellText(row.getCell(colOf.linkSource)) : '',
      pic: colOf.pic ? cellText(row.getCell(colOf.pic)) : '',
      projectType: colOf.projectType ? cellText(row.getCell(colOf.projectType)) : '',
      notes: colOf.notes ? cellText(row.getCell(colOf.notes)) : '',
      rfqDueDateRaw: rfqDueCell ? cellText(rfqDueCell) : '',
      rfqDueDate: rfqDueCell ? toDate(rfqDueCell) : null,
      rfqReceivedDateRaw: colOf.rfqReceivedDate ? cellText(row.getCell(colOf.rfqReceivedDate)) : '',
      sofeaDateRaw: colOf.sofeaDate ? cellText(row.getCell(colOf.sofeaDate)) : '',
      submissionDateRaw: colOf.submissionDate ? cellText(row.getCell(colOf.submissionDate)) : '',
      status: rowStatus(row, dataCols, colOf.projectId),
    })
  }

  const stats = { total: rows.length, completed: 0, pendingReview: 0, other: 0, none: 0 }
  for (const row of rows) {
    if (row.status === STATUS.COMPLETED) stats.completed++
    else if (row.status === STATUS.PENDING_REVIEW) stats.pendingReview++
    else if (row.status === STATUS.OTHER) stats.other++
    else stats.none++
  }
  return { rows, stats }
}
