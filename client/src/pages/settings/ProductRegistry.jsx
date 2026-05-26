import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Trash2, Package, Upload, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react'

const registrySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  itemName: z.string().optional(),
  uom: z.string().optional(),
})

export default function ProductRegistry() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [modal, setModal] = useState(false)
  const [toast, setToast] = useState('')
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)
  const LIMIT = 50

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registrySchema),
  })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Debounce: update debouncedSearch 300ms after search changes; reset to page 1
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Load items whenever debouncedSearch, page, or refreshKey changes
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const r = await api.get('/product-registry', {
          params: { search: debouncedSearch, page, limit: LIMIT },
        })
        setItems(r.data.items)
        setTotal(r.data.total)
        setTotalPages(r.data.totalPages)
      } catch {
        showToast('Failed to load registry')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [debouncedSearch, page, refreshKey])

  async function onSubmit(data) {
    try {
      await api.post('/product-registry', data)
      showToast('Product added to registry')
      setModal(false)
      reset()
      setPage(1)
      setRefreshKey(k => k + 1)
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this product from the registry?')) return
    try {
      await api.delete(`/product-registry/${id}`)
      showToast('Product removed')
      setItems(prev => prev.filter(x => x.id !== id))
      setTotal(t => t - 1)
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed')
    }
  }

  function downloadTemplate() {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/product-registry/template`
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const formData = new FormData()
    formData.append('file', file)
    setImporting(true)
    try {
      const r = await api.post('/product-registry/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      showToast(`Imported ${r.data.imported} products${r.data.skipped ? `, skipped ${r.data.skipped} invalid rows` : ''}`)
      setPage(1)
      setRefreshKey(k => k + 1)
    } catch (err) {
      showToast(err.response?.data?.error || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-50">{toast}</div>}

      <div className="bg-navy-900 border border-navy-700 rounded-xl p-5">
        <p className="text-slate-300 text-sm font-medium mb-1">Product Registry</p>
        <p className="text-slate-500 text-xs">
          Products in this registry are automatically skipped from the product-import.xlsx output during BOM conversion.
          New products discovered during conversion are automatically added here.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by item ID or name..."
            className="w-full bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">{total.toLocaleString()} products</span>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-300 px-3 py-2 rounded-lg text-sm">
            <Download size={15} /> Template
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-300 px-3 py-2 rounded-lg text-sm disabled:opacity-50">
            <Upload size={15} /> {importing ? 'Importing...' : 'Import'}
          </button>
          <button onClick={() => { reset(); setModal(true) }}
            className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-electric-400 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : !items.length ? (
          <div className="p-12 text-center">
            <Package size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 mb-1">{search ? 'No products match your search.' : 'No products in the registry yet.'}</p>
            <p className="text-slate-500 text-xs">Import a product list or products will be auto-added during BOM conversion.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-800 border-b border-navy-700">
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Item ID</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Item Name</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">UOM</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 font-mono text-electric-300">{item.itemId}</td>
                  <td className="px-4 py-3 text-slate-300">{item.itemName || <span className="text-slate-600 italic">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{item.uom || <span className="text-slate-600 italic">—</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(item.id)}>
                      <Trash2 size={15} className="text-slate-400 hover:text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 disabled:opacity-40 hover:bg-navy-700"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 disabled:opacity-40 hover:bg-navy-700"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl w-full max-w-md">
            <div className="p-5 border-b border-navy-700 font-semibold text-slate-100">Add Product to Registry</div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Item ID <span className="text-red-400">*</span></label>
                <input {...register('itemId')} placeholder="e.g. PART-001"
                  className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400" />
                {errors.itemId && <p className="text-red-400 text-xs mt-1">{errors.itemId.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Item Name <span className="text-slate-500">(optional)</span></label>
                <input {...register('itemName')} placeholder="e.g. Widget Assembly"
                  className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">UOM <span className="text-slate-500">(optional)</span></label>
                <input {...register('uom')} placeholder="e.g. EA"
                  className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-electric-400" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(false)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 text-white py-2 rounded-lg text-sm font-medium">
                  {isSubmitting ? 'Adding...' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
