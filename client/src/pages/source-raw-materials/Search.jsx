import { useState } from 'react'
import api from '@/lib/api'
import {
  Search as SearchIcon, ExternalLink, FileText, Loader2, AlertCircle,
  PackageSearch, ShieldCheck, Cpu,
} from 'lucide-react'

// Best unit price for a quantity: the cheapest tier whose break quantity is <= qty.
// Returns null if qty is below every tier's break (i.e. minimum not met).
function unitPriceAt(prices, qty) {
  const eligible = prices.filter(p => p.quantity <= qty)
  if (!eligible.length) return null
  return Math.min(...eligible.map(p => p.amount))
}

function money(n, currency = 'USD') {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

export default function SourceRawMaterialsSearch() {
  const [term, setTerm] = useState('')
  const [qty, setQty] = useState(1)
  const [phase, setPhase] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleSearch(e) {
    e?.preventDefault()
    const q = term.trim()
    if (q.length < 2) return
    setPhase('loading')
    setError('')
    setResult(null)
    try {
      const { data } = await api.get('/part-sourcing/search', { params: { q } })
      setResult(data)
      setPhase('done')
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed. Please try again.')
      setPhase('error')
    }
  }

  const part = result?.parts?.[0]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            autoFocus
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Enter a manufacturer part number, e.g. 193643-1"
            className="w-full bg-navy-800 border border-navy-600 rounded-xl pl-11 pr-4 py-3.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric-400 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={phase === 'loading' || term.trim().length < 2}
          className="px-6 rounded-xl bg-electric-500 hover:bg-electric-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center gap-2 transition-colors"
        >
          {phase === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <SearchIcon size={18} />}
          Search
        </button>
      </form>

      {/* States */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <PackageSearch size={48} className="text-slate-600 mb-4" />
          <p className="text-slate-400 max-w-sm">Search live distributor stock and pricing from TrustedParts.com by manufacturer part number.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3">
          <AlertCircle size={18} className="shrink-0" /> {error}
        </div>
      )}

      {phase === 'done' && !part && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <PackageSearch size={48} className="text-slate-600 mb-4" />
          <p className="text-slate-300 font-medium">No matches for “{result.query}”.</p>
          <p className="text-slate-500 text-sm mt-1">Check the part number and try again.</p>
        </div>
      )}

      {phase === 'done' && part && (
        <>
          <PartHeader part={part} />
          <OffersTable offers={part.offers} qty={qty} setQty={setQty} />
        </>
      )}
    </div>
  )
}

function PartHeader({ part }) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 flex flex-wrap items-start gap-6">
      <div className="w-20 h-20 rounded-lg bg-navy-900 border border-navy-600 flex items-center justify-center shrink-0 overflow-hidden">
        {part.imageUrl
          ? <img src={part.imageUrl} alt="" className="w-full h-full object-contain" />
          : <Cpu size={28} className="text-slate-600" />}
      </div>

      <div className="flex-1 min-w-[240px]">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-2xl font-bold text-slate-100">{part.partNumber}</h2>
          <span className="text-slate-400">by {part.manufacturer}</span>
          {part.productUrl && (
            <a href={part.productUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-electric-300 hover:text-electric-400 text-sm">
              <ExternalLink size={14} /> Part Details
            </a>
          )}
        </div>
        {part.description && <p className="text-slate-400 mt-1">{part.description}</p>}
        <div className="flex gap-4 mt-3 text-xs text-slate-500 flex-wrap">
          <span>{part.offerCount} distributor offer{part.offerCount === 1 ? '' : 's'}</span>
          {part.lifecycleRisk && <span>Lifecycle: {part.lifecycleRisk}</span>}
          {part.isAffectedByTariff && <span className="text-amber-400">Tariff-affected</span>}
        </div>
      </div>

      {part.priceRange && (
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Price range</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">
            {money(part.priceRange.min, part.priceRange.currency)} – {money(part.priceRange.max, part.priceRange.currency)}
          </p>
        </div>
      )}
    </div>
  )
}

function OffersTable({ offers, qty, setQty }) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-navy-600">
        <h3 className="font-semibold text-slate-200">Distributors</h3>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Qty
          <input
            type="number" min={1} value={qty}
            onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-electric-400"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-navy-600">
              <th className="px-5 py-3 font-medium">Distributor</th>
              <th className="px-3 py-3 font-medium">MOQ</th>
              <th className="px-3 py-3 font-medium">Pkg</th>
              <th className="px-3 py-3 font-medium">Availability</th>
              <th className="px-3 py-3 font-medium">RoHS</th>
              <th className="px-3 py-3 font-medium">Order pricing</th>
              <th className="px-3 py-3 font-medium text-right">Total @ {qty}</th>
              <th className="px-5 py-3 font-medium text-right">Buy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {offers.map((o, i) => {
              const unit = unitPriceAt(o.prices, qty)
              const belowMoq = o.moq != null && qty < o.moq
              const total = unit != null && !belowMoq ? unit * qty : null
              return (
                <tr key={i} className="hover:bg-navy-700/40">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-100">{o.distributor}</div>
                    {o.distributorPartNumber && <div className="text-xs text-slate-500 font-mono">{o.distributorPartNumber}</div>}
                  </td>
                  <td className="px-3 py-3 text-slate-300">{o.moq != null ? o.moq.toLocaleString() : '—'}</td>
                  <td className="px-3 py-3 text-slate-400">{o.packaging || '—'}</td>
                  <td className="px-3 py-3 text-slate-400 max-w-[180px]">
                    {o.stock.quantity > 0
                      ? <span className="text-emerald-400">{o.stock.quantity.toLocaleString()} in stock</span>
                      : <span>{o.stock.availability || 'Out of stock'}</span>}
                  </td>
                  <td className="px-3 py-3">
                    {o.rohs === true ? <ShieldCheck size={16} className="text-emerald-400" />
                      : o.rohs === false ? <span className="text-xs text-slate-500">No</span>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-0.5">
                      {o.prices.length
                        ? o.prices.slice(0, 3).map((p, j) => (
                            <div key={j} className="text-xs text-slate-400 whitespace-nowrap">
                              <span className="text-slate-500">{p.quantity.toLocaleString()}+</span> {p.formatted || money(p.amount, o.currency)}
                            </div>
                          ))
                        : <span className="text-xs text-slate-600">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {belowMoq
                      ? <span className="text-xs text-slate-500">min. not met</span>
                      : <span className="font-semibold text-slate-100">{money(total, o.currency)}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {o.datasheetUrl && (
                        <a href={o.datasheetUrl} target="_blank" rel="noreferrer" title="Datasheet"
                          className="text-slate-500 hover:text-slate-300"><FileText size={16} /></a>
                      )}
                      {o.buyUrl && (
                        <a href={o.buyUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-electric-500/20 hover:bg-electric-500/30 text-electric-300 text-xs font-medium whitespace-nowrap">
                          Buy <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
