import { FileText } from 'lucide-react'

export default function RfqDashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center">
      <FileText size={48} className="text-slate-600 mb-4" />
      <h2 className="text-xl font-semibold text-slate-200 mb-2">RFQ Dashboard</h2>
      <p className="text-slate-400 max-w-sm">Requirements are still being defined. This page will be built out once they're ready.</p>
    </div>
  )
}
