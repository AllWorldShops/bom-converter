import { useState, useRef, useEffect } from 'react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Search as SearchIcon, ExternalLink, FileText, Loader2, AlertCircle,
  PackageSearch, ShieldCheck, Cpu, ListTree, Store, MessageSquare, Info, Send,
} from 'lucide-react'

const INITIAL_CHAT_QUERY = 'Find independent stockists that currently list this part, with their product links.'

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
  const [tab, setTab] = useState('overview') // overview | specs | distributors | chat
  const [chat, setChat] = useState({ messages: [], loading: false, error: '' })
  const chatStartedRef = useRef(false)

  async function handleSearch(e) {
    e?.preventDefault()
    const q = term.trim()
    if (q.length < 2) return
    setPhase('loading')
    setError('')
    setResult(null)
    setTab('overview')
    setChat({ messages: [], loading: false, error: '' })
    chatStartedRef.current = false
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

  async function sendChat(text) {
    const history = [...chat.messages, { role: 'user', content: text }]
    setChat(c => ({ ...c, messages: history, loading: true, error: '' }))
    try {
      const { data } = await api.post('/part-sourcing/chat', {
        part: {
          partNumber: part.partNumber,
          manufacturer: part.manufacturer,
          description: part.description,
          specifications: part.specifications,
        },
        messages: history,
      })
      setChat(c => ({
        ...c,
        messages: [...history, { role: 'assistant', content: data.message, stockists: data.stockists }],
        loading: false,
      }))
    } catch (err) {
      setChat(c => ({ ...c, loading: false, error: err.response?.data?.error || 'Chat failed. Please try again.' }))
    }
  }

  // Auto-run the stockist search the first time the Ask AI tab is opened for a part.
  function ensureChatStarted() {
    if (chatStartedRef.current) return
    chatStartedRef.current = true
    sendChat(INITIAL_CHAT_QUERY)
  }

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

          {/* Tabs */}
          <div>
            <div className="flex gap-1 border-b border-navy-600">
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={Info}
                label="Overview" />
              <TabButton active={tab === 'specs'} onClick={() => setTab('specs')} icon={ListTree}
                label="Specifications" count={part.specifications.length} />
              <TabButton active={tab === 'distributors'} onClick={() => setTab('distributors')} icon={Store}
                label="Distributors" count={part.offerCount} />
              <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessageSquare}
                label="Ask AI" />
            </div>

            <div className="pt-5">
              {tab === 'overview' && <OverviewTab part={part} onViewDistributors={() => setTab('distributors')} />}
              {tab === 'specs' && <SpecsTab specifications={part.specifications} />}
              {tab === 'distributors' && <OffersTable offers={part.offers} qty={qty} setQty={setQty} />}
              {tab === 'chat' && <ChatTab part={part} chat={chat} onSend={sendChat} onMount={ensureChatStarted} />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
        active ? 'border-electric-400 text-electric-300' : 'border-transparent text-slate-400 hover:text-slate-200'
      )}
    >
      <Icon size={16} /> {label}
      {count != null && <span className="text-xs text-slate-500">({count})</span>}
    </button>
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
        </div>
        {part.description && <p className="text-slate-400 mt-1">{part.description}</p>}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {part.productUrl && (
            <a href={part.productUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-electric-300 hover:text-electric-400 text-sm">
              <ExternalLink size={14} /> Part Details
            </a>
          )}
          {part.datasheetUrl && (
            <a href={part.datasheetUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-electric-300 hover:text-electric-400 text-sm">
              <FileText size={14} /> Datasheet
            </a>
          )}
          {part.lifecycleRisk && <span className="text-xs text-slate-500">Lifecycle: {part.lifecycleRisk}</span>}
          {part.isAffectedByTariff && <span className="text-xs text-amber-400">Tariff-affected</span>}
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

function OverviewTab({ part, onViewDistributors }) {
  const inStock = part.offers.filter(o => o.stock.quantity > 0).length
  const rohsCompliant = part.offers.some(o => o.rohs === true)
  const topSpecs = part.specifications.slice(0, 6)

  const stats = [
    { label: 'Best price', value: part.priceRange ? money(part.priceRange.min, part.priceRange.currency) : '—', sub: 'lowest unit price' },
    { label: 'Distributors', value: part.offerCount, sub: `${inStock} with stock` },
    { label: 'RoHS', value: rohsCompliant ? 'Compliant' : '—', sub: rohsCompliant ? 'per distributor data' : 'not reported' },
    { label: 'Lifecycle', value: part.lifecycleRisk || 'Active', sub: part.isAffectedByTariff ? 'tariff-affected' : 'risk status' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-navy-800 border border-navy-600 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-semibold text-slate-100 mt-1">{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-navy-800 border border-navy-600 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-200">Key specifications</h3>
          <button onClick={onViewDistributors} className="text-sm text-electric-300 hover:text-electric-400">
            View {part.offerCount} distributor offers →
          </button>
        </div>
        {topSpecs.length ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {topSpecs.map((s, i) => (
              <div key={i} className="flex justify-between gap-4 py-1.5 border-b border-navy-700">
                <dt className="text-slate-400 text-sm">{s.key}</dt>
                <dd className="text-slate-100 text-sm font-medium text-right">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-slate-500 text-sm">No specifications available for this part.</p>
        )}
      </div>
    </div>
  )
}

function SpecsTab({ specifications }) {
  if (!specifications.length) {
    return <p className="text-slate-500 text-sm py-8 text-center">No specifications available for this part.</p>
  }
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-navy-600">
        {specifications.map((s, i) => (
          <div key={i} className="bg-navy-800 px-5 py-3 flex justify-between gap-4">
            <dt className="text-slate-400 text-sm">{s.key}</dt>
            <dd className="text-slate-100 text-sm font-medium text-right">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function ChatTab({ part, chat, onSend, onMount }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => { onMount() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.messages, chat.loading])

  // Skip the auto-run initial query when rendering the transcript (it's system-like).
  const visible = chat.messages.filter((m, i) => !(i === 0 && m.role === 'user' && m.content === INITIAL_CHAT_QUERY))

  function submit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || chat.loading) return
    setInput('')
    onSend(text)
  }

  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl flex flex-col h-[32rem]">
      <div className="px-5 py-3 border-b border-navy-600 flex items-center gap-2">
        <MessageSquare size={16} className="text-electric-300" />
        <h3 className="font-semibold text-slate-200">Ask AI about {part.partNumber}</h3>
        <span className="text-xs text-slate-500 ml-auto">Independent stockists · electronics parts only</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {visible.length === 0 && !chat.loading && (
          <p className="text-slate-500 text-sm text-center py-8">Searching for independent stockists…</p>
        )}
        {visible.map((m, i) => <ChatBubble key={i} message={m} />)}
        {chat.loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Searching &amp; thinking…
          </div>
        )}
        {chat.error && (
          <div className="flex items-center gap-2 text-red-300 text-sm">
            <AlertCircle size={16} /> {chat.error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="p-3 border-t border-navy-600 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Ask about ${part.partNumber} — stockists, specs, availability…`}
          className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-4 py-2.5 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-electric-400"
        />
        <button type="submit" disabled={chat.loading || !input.trim()}
          className="px-4 rounded-lg bg-electric-500 hover:bg-electric-400 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-2">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

function ChatBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap bg-electric-500/20 text-slate-100">
          {message.content}
        </div>
      </div>
    )
  }

  const cards = message.stockists || []
  return (
    <div className="space-y-3">
      {message.content && (
        <div className="max-w-[90%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap bg-navy-900 border border-navy-600 text-slate-200">
          {message.content}
        </div>
      )}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((s, i) => <StockistCard key={i} s={s} />)}
        </div>
      )}
    </div>
  )
}

function StockistCard({ s }) {
  return (
    <div className="bg-navy-900 border border-navy-600 rounded-xl p-4 flex flex-col gap-2 hover:border-electric-500/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Store size={16} className="text-electric-300 shrink-0" />
          <p className="font-semibold text-slate-100 truncate">{s.name}</p>
        </div>
        {s.stock && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 whitespace-nowrap">{s.stock}</span>
        )}
      </div>
      {(s.price || s.note) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {s.price && <span className="text-slate-200">{s.price}</span>}
          {s.note && <span className="text-xs text-amber-400/90">{s.note}</span>}
        </div>
      )}
      <a href={s.url} target="_blank" rel="noreferrer"
        className="mt-auto inline-flex items-center gap-1 text-xs text-electric-300 hover:text-electric-400">
        <ExternalLink size={12} className="shrink-0" /> View listing
      </a>
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
