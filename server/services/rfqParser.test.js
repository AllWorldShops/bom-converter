import ExcelJS from 'exceljs'
import { parseRfqWorkbook, STATUS } from './rfqParser.js'

// Build a synthetic workbook mirroring the real sheet's shape: header row + one green (completed),
// one orange (pending review), one uncolored (none) row, plus a blank spacer that must be skipped.
async function buildBuffer() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['#', 'Project ID', 'Link', 'Link Source', 'RFQ Due Date', 'RFQ Received Date',
    'SOFEA Date', 'Customer', 'PIC', 'Project Type', 'Notes', 'Submission Date', 'Status'])

  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const paint = (row, argb) => { for (let c = 2; c <= 12; c++) row.getCell(c).fill = fill(argb) }

  const green = ws.addRow(['1', 'PRJ-G', '', 'Click', '', '', '', 'ACME', '', '', '', ''])
  paint(green, 'FF70AD47')                                   // completed

  const orange = ws.addRow(['2', 'PRJ-O', '', 'Click', '', '', '', 'BETA', '', '', 'urgent', ''])
  paint(orange, 'FFED7D31')                                  // pending review

  ws.addRow(['3', 'PRJ-N', '', 'Click', '', '', '', 'GAMMA', '', '', '', ''])  // no fill -> none
  ws.addRow(['', '', '', '', '', '', '', '', '', '', '', ''])                   // blank spacer -> skipped

  return Buffer.from(await wb.xlsx.writeBuffer())
}

test('classifies rows by fill color and skips blank rows', async () => {
  const { rows, stats } = await parseRfqWorkbook(await buildBuffer())

  expect(stats.total).toBe(3) // blank spacer dropped
  expect(stats.completed).toBe(1)
  expect(stats.pendingReview).toBe(1)
  expect(stats.none).toBe(1)

  const byId = Object.fromEntries(rows.map(r => [r.projectId, r]))
  expect(byId['PRJ-G'].status).toBe(STATUS.COMPLETED)
  expect(byId['PRJ-O'].status).toBe(STATUS.PENDING_REVIEW)
  expect(byId['PRJ-N'].status).toBe(STATUS.NONE)
  expect(byId['PRJ-O'].customer).toBe('BETA')
  expect(byId['PRJ-O'].notes).toBe('urgent')
})

test('rejects a workbook that is not the RFQ master sheet', async () => {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('X').addRow(['foo', 'bar'])
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  await expect(parseRfqWorkbook(buf)).rejects.toThrow(/RFQ master sheet/)
})
