import { useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import {
  RefreshCw, AlertTriangle, CheckCircle2, CircleDashed, FileSpreadsheet, Search,
  CalendarX2, CalendarClock, Flag, X,
} from 'lucide-react'

const DUE_SOON_DAYS = 7

const STATUS_META = {
  PENDING_REVIEW: { label: 'Pending Review', dot: 'bg-orange-400', badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
  COMPLETED:      { label: 'Completed',      dot: 'bg-green-400',  badge: 'bg-green-500/20 text-green-300 border border-green-500/30' },
  OTHER:          { label: 'Flagged',        dot: 'bg-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
  NONE:           { label: 'No status',      dot: 'bg-slate-500',  badge: 'bg-navy-700 text-slate-400 border border-navy-600' },
}

function showDate(raw) {
  if (!raw) return '—'
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d.toLocaleDateString()
  }
  return raw
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

// Urgency only applies to items still needing action (Pending Review) that carry a real due date.
function urgencyOf(row) {
  if (row.status !== 'PENDING_REVIEW' || !row.rfqDueDate) return null
  const due = new Date(row.rfqDueDate)
  if (isNaN(due.getTime())) return null
  const today = startOfToday()
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return { kind: 'overdue', days }
  if (days <= DUE_SOON_DAYS) return { kind: 'due_soon', days }
  return null
}

function StatCard({ icon: Icon, label, value, tone, active, onClick, footer }) {
  const tones = {
    electric: { ring: 'ring-electric-400', icon: 'text-electric-300 bg-electric-500/15', bar: 'bg-electric-500' },
    red:      { ring: 'ring-red-400',      icon: 'text-red-300 bg-red-500/15',          bar: 'bg-red-500' },
    orange:   { ring: 'ring-orange-400',   icon: 'text-orange-300 bg-orange-500/15',    bar: 'bg-orange-500' },
    green:    { ring: 'ring-green-400',     icon: 'text-green-300 bg-green-500/15',      bar: 'bg-green-500' },
    slate:    { ring: 'ring-slate-400',     icon: 'text-slate-300 bg-slate-500/15',      bar: 'bg-slate-500' },
  }[tone]
  // Card is a div (not a button) so an optional interactive footer chip can live inside without
  // nesting one button in another.
  return (
    <div className={`bg-navy-900 border border-navy-700 rounded-xl relative overflow-hidden transition-all ${active ? `ring-2 ${tones.ring}` : ''}`}>
      <span className={`absolute left-0 top-0 h-full w-1 ${tones.bar}`} />
      <button onClick={onClick} className="w-full text-left p-4 hover:bg-navy-800/40 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones.icon}`}><Icon size={20} /></div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-100">{value}</p>
          </div>
        </div>
      </button>
      {footer && <div className="px-4 pb-3 -mt-1">{footer}</div>}
    </div>
  )
}

export default function RfqDashboard() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ lastSyncedAt: null, lastSource: null })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')       // '' | PENDING_REVIEW | COMPLETED | NONE | OTHER
  const [urgency, setUrgency] = useState('')      // '' | overdue | due_soon
  const [customer, setCustomer] = useState('')
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  async function loadAll() {
    setLoading(true)
    try {
      const [proj, stats] = await Promise.all([
        api.get('/rfq/projects'),
        api.get('/rfq/stats').catch(() => ({ data: {} })),
      ])
      setRows(proj.data)
      setMeta({ lastSyncedAt: stats.data.lastSyncedAt ?? proj.data[0]?.syncedAt ?? null, lastSource: stats.data.lastSource ?? null })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadAll().catch(() => {}) }, [])

  // Everything derived from the single row set → cards, filters, and alerts never drift apart.
  const counts = useMemo(() => {
    const c = { total: rows.length, PENDING_REVIEW: 0, COMPLETED: 0, NONE: 0, OTHER: 0, overdue: 0, dueSoon: 0 }
    for (const r of rows) {
      c[r.status] = (c[r.status] || 0) + 1
      const u = urgencyOf(r)
      if (u?.kind === 'overdue') c.overdue++
      else if (u?.kind === 'due_soon') c.dueSoon++
    }
    return c
  }, [rows])

  const customers = useMemo(() => [...new Set(rows.map(r => r.customer).filter(Boolean))].sort(), [rows])

  // Completion rate = completed out of ALL projects.
  const completionRate = counts.total ? Math.round((counts.COMPLETED / counts.total) * 100) : 0
  const pct = n => (counts.total ? (n / counts.total) * 100 : 0)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (status && r.status !== status) return false
      if (customer && r.customer !== customer) return false
      if (urgency && urgencyOf(r)?.kind !== urgency) return false
      if (needle && !(`${r.projectId} ${r.customer} ${r.notes}`.toLowerCase().includes(needle))) return false
      return true
    })
  }, [rows, status, customer, urgency, q])

  function pickStatus(s) { setUrgency(''); setStatus(cur => (cur === s ? '' : s)) }
  function pickUrgency(u) { setStatus(''); setUrgency(cur => (cur === u ? '' : u)) }
  const filterActive = status || urgency || customer || q

  async function onSyncFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSyncing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/rfq/sync', form)
      showToast(`Synced ${data.stats.total} projects · ${data.stats.pendingReview} need action`)
      await loadAll()
    } catch (err) {
      showToast(err.response?.data?.error || 'Sync failed')
    } finally {
      setSyncing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const hasData = rows.length > 0

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-4 right-4 bg-navy-800 border border-navy-600 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-sm z-[60]">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-lg">RFQ Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {meta.lastSyncedAt
              ? `Last synced ${new Date(meta.lastSyncedAt).toLocaleString()}${meta.lastSource ? ` (${meta.lastSource})` : ''}`
              : 'Not synced yet'}
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onSyncFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={syncing}
            className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-12 text-center">
          <FileSpreadsheet size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-300 font-medium">No RFQ data yet</p>
          <p className="text-slate-500 text-sm mt-1">Click <strong>Sync Now</strong> and upload the PENDING PROJECT Excel file to populate the dashboard.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard icon={CalendarX2} label="Overdue" value={counts.overdue} tone="red" active={urgency === 'overdue'}
              onClick={() => pickUrgency('overdue')}
              footer={
                counts.dueSoon > 0 ? (
                  <button onClick={() => pickUrgency('due_soon')}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition-colors ${urgency === 'due_soon' ? 'bg-amber-500/25 border-amber-500/60 text-amber-100' : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'}`}>
                    <CalendarClock size={13} /> <strong>{counts.dueSoon}</strong> due ≤{DUE_SOON_DAYS}d
                  </button>
                ) : counts.overdue === 0 ? (
                  <p className="text-xs text-green-400/80 flex items-center gap-1"><CheckCircle2 size={12} /> All pending on track</p>
                ) : (
                  <p className="text-xs text-slate-500">pending RFQs past due</p>
                )
              }
            />
            <StatCard icon={FileSpreadsheet} label="Total Projects" value={counts.total} tone="electric" active={!filterActive} onClick={() => { setStatus(''); setUrgency(''); setCustomer(''); setQ('') }} />
            <StatCard icon={AlertTriangle} label="Action Required" value={counts.PENDING_REVIEW} tone="orange" active={status === 'PENDING_REVIEW'} onClick={() => pickStatus('PENDING_REVIEW')} />
            <StatCard icon={CheckCircle2} label="Completed" value={counts.COMPLETED} tone="green" active={status === 'COMPLETED'} onClick={() => pickStatus('COMPLETED')} />
            <StatCard icon={CircleDashed} label="No Status" value={counts.NONE} tone="slate" active={status === 'NONE'} onClick={() => pickStatus('NONE')} />
          </div>

          {/* Completion rate: completed vs pending, with a full breakdown bar */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Completion Rate</p>
                <p className="text-3xl font-bold text-green-300 leading-tight">{completionRate}%</p>
                <p className="text-xs text-slate-500 mt-0.5">{counts.COMPLETED} of {counts.total} projects completed</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {[
                  { label: 'Completed', n: counts.COMPLETED, dot: 'bg-green-500', s: 'COMPLETED' },
                  { label: 'Pending', n: counts.PENDING_REVIEW, dot: 'bg-orange-500', s: 'PENDING_REVIEW' },
                  { label: 'Flagged', n: counts.OTHER, dot: 'bg-yellow-500', s: 'OTHER' },
                  { label: 'No status', n: counts.NONE, dot: 'bg-slate-500', s: 'NONE' },
                ].filter(x => x.n > 0).map(x => (
                  <button key={x.s} onClick={() => pickStatus(x.s)} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200">
                    <span className={`w-2.5 h-2.5 rounded-full ${x.dot}`} />
                    {x.label} <span className="text-slate-300 font-medium">{x.n}</span>
                    <span className="text-slate-600">({Math.round(pct(x.n))}%)</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="h-3 w-full rounded-full overflow-hidden bg-navy-800 flex">
              <div className="bg-green-500 h-full" style={{ width: `${pct(counts.COMPLETED)}%` }} title={`Completed ${counts.COMPLETED}`} />
              <div className="bg-orange-500 h-full" style={{ width: `${pct(counts.PENDING_REVIEW)}%` }} title={`Pending ${counts.PENDING_REVIEW}`} />
              <div className="bg-yellow-500 h-full" style={{ width: `${pct(counts.OTHER)}%` }} title={`Flagged ${counts.OTHER}`} />
              <div className="bg-slate-600 h-full" style={{ width: `${pct(counts.NONE)}%` }} title={`No status ${counts.NONE}`} />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search project, customer, notes…"
                className="w-full bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400" />
            </div>
            <select value={customer} onChange={e => setCustomer(e.target.value)}
              className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-electric-400 max-w-[220px]">
              <option value="">All customers</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {filterActive && (
              <button onClick={() => { setStatus(''); setUrgency(''); setCustomer(''); setQ('') }}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 px-2 py-2">
                <X size={14} /> Clear
              </button>
            )}
          </div>

          <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-navy-700 text-xs text-slate-500">
              Showing <span className="text-slate-300 font-medium">{filtered.length}</span> of {counts.total} projects
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-800 border-b border-navy-700">
                    {['', 'Project ID', 'Customer', 'Type', 'RFQ Due', 'Submission', 'PIC', 'Notes', 'Status'].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No projects match these filters.</td></tr>
                  ) : filtered.map(p => {
                    const m = STATUS_META[p.status] || STATUS_META.NONE
                    const u = urgencyOf(p)
                    const rowClass = u?.kind === 'overdue'
                      ? 'bg-red-500/5 border-l-2 border-l-red-500'
                      : p.status === 'PENDING_REVIEW'
                        ? 'bg-orange-500/5 border-l-2 border-l-orange-500'
                        : 'border-l-2 border-l-transparent'
                    return (
                      <tr key={p.id} className={`border-b border-navy-800 ${rowClass}`}>
                        <td className="pl-4 pr-1 py-2.5"><span className={`inline-block w-2.5 h-2.5 rounded-full ${u?.kind === 'overdue' ? 'bg-red-500' : m.dot}`} /></td>
                        <td className="px-4 py-2.5 text-slate-100 font-mono text-xs max-w-[220px] truncate" title={p.projectId}>{p.projectId || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{p.customer || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-400">{p.projectType || '—'}</td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${u?.kind === 'overdue' ? 'text-red-300 font-medium' : u?.kind === 'due_soon' ? 'text-amber-300' : 'text-slate-400'}`}>
                          {showDate(p.rfqDueDateRaw)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 max-w-[200px] truncate" title={p.submissionDateRaw}>{showDate(p.submissionDateRaw)}</td>
                        <td className="px-4 py-2.5 text-slate-400">{p.pic || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-400 max-w-[220px] truncate" title={p.notes}>{p.notes || '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span>
                          {u?.kind === 'overdue' && <span className="ml-1.5 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">Overdue {Math.abs(u.days)}d</span>}
                          {u?.kind === 'due_soon' && <span className="ml-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Due {u.days}d</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
