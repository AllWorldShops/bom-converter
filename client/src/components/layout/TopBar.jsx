export default function TopBar({ title }) {
  return (
    <header className="h-14 bg-navy-900 border-b border-navy-700 flex items-center px-6">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
    </header>
  )
}
