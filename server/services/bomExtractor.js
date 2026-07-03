// Deterministic BOM extraction — no AI. Each customer sends a fixed Excel layout,
// so we read cells by column position. Returns the same { parent, children } shape the
// downstream mapping + Excel generation expect.
//
// Column mapping (per customer, stored as JSON on Customer.columnMapping):
//   { headerRow, parentRow, childStartRow, columns: { field: "A".."Z" } }
// A missing/empty column letter means that field is left blank.

export const DEFAULT_MAPPING = {
  headerRow: 1,
  parentRow: 2,
  childStartRow: 3,
  columns: {
    findNo: 'A',
    itemId: 'B',
    itemName: 'C',
    revision: 'D',
    quantity: 'E',
    uom: 'F',
    manufacturer: 'G',
    manufacturerPartNo: 'H',
  },
}

// "A" -> 0, "B" -> 1, ... "AA" -> 26. Empty/invalid -> -1.
export function colIndex(letter) {
  if (!letter) return -1
  let n = 0
  for (const ch of String(letter).trim().toUpperCase()) {
    const v = ch.charCodeAt(0) - 64
    if (v < 1 || v > 26) return -1
    n = n * 26 + v
  }
  return n - 1
}

function cell(row, letter) {
  const i = colIndex(letter)
  if (i < 0 || !row) return ''
  return String(row[i] ?? '').trim()
}

function toNumber(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

export function resolveMapping(columnMapping) {
  if (!columnMapping) return DEFAULT_MAPPING
  let parsed
  try {
    parsed = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping
  } catch {
    return DEFAULT_MAPPING
  }
  return {
    headerRow: parsed.headerRow || DEFAULT_MAPPING.headerRow,
    parentRow: parsed.parentRow || DEFAULT_MAPPING.parentRow,
    childStartRow: parsed.childStartRow || DEFAULT_MAPPING.childStartRow,
    columns: { ...DEFAULT_MAPPING.columns, ...(parsed.columns || {}) },
  }
}

/**
 * Extract { parent, children } from spreadsheet rows using the customer's column mapping.
 * @param {any[][]} rows - array of row arrays (from xlsx sheet_to_json header:1)
 * @param {{ columnMapping?: string|null }} customer
 */
export function extractBom(rows, customer) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No spreadsheet rows found. Direct-column extraction supports Excel (.xlsx/.xls) files only.')
  }
  const m = resolveMapping(customer?.columnMapping)
  const cols = m.columns

  const parentRow = rows[m.parentRow - 1]
  if (!parentRow) throw new Error(`Parent row ${m.parentRow} not found in the file.`)

  const parent = {
    itemId: cell(parentRow, cols.itemId),
    itemName: cell(parentRow, cols.itemName),
    uom: cell(parentRow, cols.uom),
    quantity: toNumber(cell(parentRow, cols.quantity)) ?? 1,
    manufacturerPartNo: cell(parentRow, cols.manufacturerPartNo),
  }
  if (!parent.itemId && !parent.itemName) {
    throw new Error(`No parent assembly found in row ${m.parentRow}. Check this customer's column mapping.`)
  }

  const children = []
  for (let r = m.childStartRow - 1; r < rows.length; r++) {
    const row = rows[r]
    const itemId = cell(row, cols.itemId)
    const itemName = cell(row, cols.itemName)
    if (!itemId && !itemName) continue // skip blank/spacer rows
    children.push({
      findNo: cell(row, cols.findNo),
      itemId,
      itemName,
      revision: cell(row, cols.revision),
      quantity: toNumber(cell(row, cols.quantity)) ?? '',
      uom: cell(row, cols.uom),
      manufacturer: cell(row, cols.manufacturer),
      manufacturerPartNo: cell(row, cols.manufacturerPartNo),
    })
  }
  if (children.length === 0) {
    throw new Error('No component rows found. Check the child start row in this customer\'s column mapping.')
  }

  return { parent, children }
}
