import xlsx from 'xlsx'

export function generateProductImport(parent, children, registryMap = new Map()) {
  const headers = [
    'External ID',
    'Name',
    'Internal Reference',
    'Unit of Measure',
    'Manufacturer/Customer Name',
    'MPN/Customer/Supplier Part No',
    'Sales',
    'Purchase',
    'Product Type',
    'routes',
    'Description',
  ]

  function toRow(item) {
    const externalId = registryMap.get(item.itemName) || `__export__.product_template_${item.itemId}`
    return [
      externalId,
      item.itemId,
      item.itemId,
      item.uom,
      item.manufacturer || '',
      item.manufacturerPartNo || '',
      'TRUE',
      'TRUE',
      'Goods',
      'PEI - Buy from Vendor',
      item.itemName,
    ]
  }

  const data = [headers, toRow(parent), ...children.map(toRow)]

  const ws = xlsx.utils.aoa_to_sheet(data)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Products')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function generateBomImport(parent, children) {
  const headers = [
    'ID',
    'Product',
    'Quantity',
    'BOM Type',
    'BOM Lines/Position',
    'BoM Lines/Component',
    'BoM Lines/Part Number',
    'BoM Lines/Description',
    'BoM Lines/Manufacturer',
    'BoM Lines/Product Unit of Measure',
    'BoM Lines/Quantity',
  ]

  const data = [headers]

  // Parent-level columns — only filled on the first child row; blank for subsequent rows
  const parentCols = [
    `__export__.mrp_bom_${parent.itemId}`,   // ID
    parent.itemId,                            // Product
    1,                                        // Quantity
    'Manufacture this product',               // BOM Type
  ]
  const blankParentCols = ['', '', '', '']

  children.forEach((child, idx) => {
    const childCols = [
      child.findNo || '',                     // BOM Lines/Position
      child.itemId || '',                     // BoM Lines/Component
      child.manufacturerPartNo || '',         // BoM Lines/Part Number
      child.itemName || '',                   // BoM Lines/Description
      child.manufacturer || '',               // BoM Lines/Manufacturer
      child.uom || '',                        // BoM Lines/Product Unit of Measure
      child.quantity || '',                   // BoM Lines/Quantity
    ]

    data.push([...(idx === 0 ? parentCols : blankParentCols), ...childCols])
  })

  const ws = xlsx.utils.aoa_to_sheet(data)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'BOM')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
