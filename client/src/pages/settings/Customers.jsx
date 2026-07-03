import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Plus, Edit2, Trash2, Building2, ArrowLeft } from 'lucide-react'

// The fields the converter reads from each customer's fixed Excel layout.
const COLS = [
  { key: 'findNo', label: 'Find No.', def: 'A' },
  { key: 'itemId', label: 'Item ID', def: 'B', required: true },
  { key: 'itemName', label: 'Item Name / Description', def: 'C' },
  { key: 'revision', label: 'Revision', def: 'D' },
  { key: 'quantity', label: 'Quantity', def: 'E' },
  { key: 'uom', label: 'Unit of Measure', def: 'F' },
  { key: 'manufacturer', label: 'Manufacturer', def: 'G' },
  { key: 'manufacturerPartNo', label: 'Manufacturer Part No.', def: 'H' },
]
const DEFAULT_MAPPING = {
  headerRow: 1,
  parentRow: 2,
  childStartRow: 3,
  columns: Object.fromEntries(COLS.map(c => [c.key, c.def])),
}

const letter = z.string().trim().regex(/^[A-Za-z]{0,3}$/, 'A, B, C…')
const schema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  description: z.string().optional(),
  columnMapping: z.object({
    headerRow: z.coerce.number().int().min(1),
    parentRow: z.coerce.number().int().min(1),
    childStartRow: z.coerce.number().int().min(1),
    columns: z.object({
      findNo: letter,
      itemId: z.string().trim().regex(/^[A-Za-z]{1,3}$/, 'Required'),
      itemName: letter,
      revision: letter,
      quantity: letter,
      uom: letter,
      manufacturer: letter,
      manufacturerPartNo: letter,
    }),
  }),
})

function mappingFromCustomer(c) {
  try {
    const m = c?.columnMapping ? JSON.parse(c.columnMapping) : null
    if (m && m.columns) {
      return {
        headerRow: m.headerRow || 1,
        parentRow: m.parentRow || 2,
        childStartRow: m.childStartRow || 3,
        columns: { ...DEFAULT_MAPPING.columns, ...m.columns },
      }
    }
  } catch { /* fall through to default */ }
  return DEFAULT_MAPPING
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [view, setView] = useState('list') // 'list' | 'form'
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  async function load() { setCustomers((await api.get('/customers')).data) }
  useEffect(() => { load() }, [])

  function openCreate() { reset({ name: '', description: '', columnMapping: DEFAULT_MAPPING }); setEditTarget(null); setView('form') }
  function openEdit(c) { reset({ name: c.name, description: c.description || '', columnMapping: mappingFromCustomer(c) }); setEditTarget(c); setView('form') }

  async function onSubmit(data) {
    try {
      if (editTarget) await api.put(`/customers/${editTarget.id}`, data)
      else await api.post('/customers', data)
      showToast(editTarget ? 'Customer updated' : 'Customer created')
      setView('list')
      load()
    } catch (err) { showToast(err.response?.data?.error || 'Save failed') }
  }

  async function handleDelete() {
    try {
      await api.delete(`/customers/${deleteTarget.id}`)
      showToast('Customer deleted')
      setDeleteTarget(null)
      load()
    } catch (err) { showToast(err.response?.data?.error || 'Delete failed') }
  }

  const inputCls = 'w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400'

  if (view === 'form') return (
    <div className="max-w-3xl">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-[60]">{toast}</div>}
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-4">
        <ArrowLeft size={16} /> Back to customers
      </button>
      <h3 className="text-lg font-semibold text-slate-100 mb-6">{editTarget ? 'Edit Customer' : 'New Customer'}</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-navy-900 border border-navy-700 rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Customer Name</label>
          <input {...register('name')} className={inputCls} />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-200">Excel Column Layout</h4>
          <p className="text-slate-500 text-xs mt-0.5 mb-3">
            This customer's Excel always uses the same columns. Tell the converter which column each field is in (by letter).
            Leave a field blank if the sheet doesn't have it.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { key: 'headerRow', label: 'Header row' },
              { key: 'parentRow', label: 'Parent assembly row' },
              { key: 'childStartRow', label: 'Components start at row' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                <input type="number" min={1} {...register(`columnMapping.${f.key}`)} className={inputCls} />
                {errors.columnMapping?.[f.key] && <p className="text-red-400 text-xs mt-1">{errors.columnMapping[f.key].message}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {COLS.map(c => (
              <div key={c.key} className="flex items-center gap-2">
                <label className="text-xs text-slate-400 flex-1">
                  {c.label}{c.required && <span className="text-electric-400"> *</span>}
                </label>
                <input {...register(`columnMapping.columns.${c.key}`)} maxLength={3}
                  className="w-16 bg-navy-800 border border-navy-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 text-center uppercase focus:outline-none focus:border-electric-400" />
              </div>
            ))}
          </div>
          {errors.columnMapping?.columns?.itemId && <p className="text-red-400 text-xs mt-2">Item ID column is required.</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Notes <span className="text-slate-500 font-normal">(optional)</span></label>
          <textarea {...register('description')} rows={2} placeholder="Any notes about this customer's files…"
            className={inputCls + ' resize-y'} />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => setView('list')} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 bg-electric-500 hover:bg-electric-400 text-white py-2 rounded-lg text-sm font-medium">
            {isSubmitting ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </form>
    </div>
  )

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-[60]">{toast}</div>}
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-semibold">Customers</h3>
        <button onClick={openCreate} className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> New Customer
        </button>
      </div>
      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        {!customers.length ? (
          <div className="p-12 text-center"><Building2 size={36} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">No customers yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-navy-800 border-b border-navy-700">
              {['Name', 'Created', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-navy-900' : 'bg-navy-800/50'}>
                  <td className="px-4 py-3 text-slate-100 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(c)}><Edit2 size={15} className="text-slate-400 hover:text-electric-300" /></button>
                    <button onClick={() => setDeleteTarget(c)}><Trash2 size={15} className="text-slate-400 hover:text-red-400" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 w-full max-w-sm">
            <p className="text-slate-300 text-sm mb-4">Delete customer <strong>{deleteTarget.name}</strong>? All associated UOM mappings and conversion logs will be removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-navy-700 text-slate-300 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
