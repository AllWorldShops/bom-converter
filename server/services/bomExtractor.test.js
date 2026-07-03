import { extractBom, colIndex, DEFAULT_MAPPING } from './bomExtractor.js'

// Rows are arrays (SheetJS header:1). Default layout: header r1, parent r2, children r3+.
const standardRows = [
  ['Find No.', 'Item ID', 'Name', 'Rev', 'Qty', 'UOM', 'Mfr', 'MPN'],
  ['', 'PARENT-1', 'Cable Assy', 'A', '', 'EA', '', ''],
  ['10', 'CHILD-1', 'Wire', 'A', '2100', 'mm', 'ALPHA', '3057'],
  ['20', 'CHILD-2', 'Label', 'A', '3', 'EA', 'ZEBRA', '10015769'],
  ['', '', '', '', '', '', '', ''], // blank spacer -> skipped
]

test('colIndex maps letters to zero-based indices', () => {
  expect(colIndex('A')).toBe(0)
  expect(colIndex('H')).toBe(7)
  expect(colIndex('')).toBe(-1)
})

test('extracts parent and children with the default K&S layout', () => {
  const { parent, children } = extractBom(standardRows, { columnMapping: null })
  expect(parent.itemId).toBe('PARENT-1')
  expect(parent.quantity).toBe(1) // empty parent qty defaults to 1
  expect(children).toHaveLength(2) // blank spacer skipped
  expect(children[0]).toMatchObject({ findNo: '10', itemId: 'CHILD-1', quantity: 2100, uom: 'mm', manufacturer: 'ALPHA' })
  expect(children[1].itemId).toBe('CHILD-2')
})

test('honors a custom column mapping', () => {
  // Item ID in column A, name in B, parent on row 1, children from row 2.
  const rows = [
    ['P-1', 'Assembly'],
    ['C-1', 'Comp One'],
    ['C-2', 'Comp Two'],
  ]
  const mapping = { headerRow: 1, parentRow: 1, childStartRow: 2, columns: { itemId: 'A', itemName: 'B' } }
  const { parent, children } = extractBom(rows, { columnMapping: JSON.stringify(mapping) })
  expect(parent.itemId).toBe('P-1')
  expect(children.map(c => c.itemId)).toEqual(['C-1', 'C-2'])
})

test('rejects a file with no rows (e.g. PDF/image)', () => {
  expect(() => extractBom([], { columnMapping: null })).toThrow(/Excel/)
})

test('DEFAULT_MAPPING is the standard A–H layout', () => {
  expect(DEFAULT_MAPPING.columns.itemId).toBe('B')
  expect(DEFAULT_MAPPING.parentRow).toBe(2)
})
