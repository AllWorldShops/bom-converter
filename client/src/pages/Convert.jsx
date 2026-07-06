import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import { Upload, X, CheckCircle, AlertCircle, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Convert() {
  const { t } = useLang()
  const STATUS_MESSAGES = [t('convert.status0'), t('convert.status1'), t('convert.status2'), t('convert.status3')]
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [file, setFile] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | loading | success | error
  const [statusIdx, setStatusIdx] = useState(0)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const intervalRef = useRef(null)

  useEffect(() => {
    api.get('/customers').then(res => setCustomers(res.data))
  }, [])

  const onDrop = useCallback(accepted => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxSize: 20 * 1024 * 1024,
  })

  function reset() {
    setFile(null)
    setSelectedCustomer('')
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    setStatusIdx(0)
  }

  async function handleConvert() {
    if (!selectedCustomer || !file) return
    setPhase('loading')
    setStatusIdx(0)
    intervalRef.current = setInterval(() => {
      setStatusIdx(i => Math.min(i + 1, STATUS_MESSAGES.length - 1))
    }, 2500)

    try {
      const form = new FormData()
      form.append('customerId', selectedCustomer)
      form.append('file', file)
      const res = await api.post('/convert', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      setPhase('success')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || t('convert.failedRetry'))
      setPhase('error')
    } finally {
      clearInterval(intervalRef.current)
    }
  }

  function handleDownload(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {phase === 'success' ? (
        <div className="bg-navy-900 border border-emerald-500/30 rounded-xl p-8 text-center space-y-4">
          <CheckCircle size={48} className="mx-auto text-emerald-400" />
          <h2 className="text-xl font-bold text-slate-100">{t('convert.complete')}</h2>
          <p className="text-slate-400">{t('convert.extracted', { p: result.productsConverted, b: result.bomsConverted })}</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => handleDownload(result.downloadUrls.productImport, 'product-import.xlsx')}
              className="flex items-center gap-2 bg-electric-500 hover:bg-electric-400 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
              <Download size={16} /> {t('convert.productFile')}
            </button>
            <button onClick={() => handleDownload(result.downloadUrls.bomImport, 'bom-import.xlsx')}
              className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 text-slate-100 px-5 py-2.5 rounded-lg font-medium transition-colors">
              <Download size={16} /> {t('convert.bomFile')}
            </button>
          </div>
          <button onClick={reset} className="text-slate-400 hover:text-slate-200 text-sm underline">{t('convert.convertAnother')}</button>
        </div>
      ) : phase === 'error' ? (
        <div className="bg-navy-900 border border-red-500/30 rounded-xl p-8 text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-red-400" />
          <h2 className="text-xl font-bold text-slate-100">{t('convert.failed')}</h2>
          <p className="text-red-400 text-sm">{errorMsg}</p>
          <button onClick={reset} className="bg-navy-700 hover:bg-navy-600 text-slate-100 px-5 py-2.5 rounded-lg font-medium transition-colors">{t('convert.tryAgain')}</button>
        </div>
      ) : phase === 'loading' ? (
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-12 text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-electric-400 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-300 font-medium">{STATUS_MESSAGES[statusIdx]}</p>
        </div>
      ) : (
        <>
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-200">{t('convert.step1')}</label>
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
              className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-electric-400">
              <option value="">{t('convert.chooseCustomer')}</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="bg-navy-900 border border-navy-700 rounded-xl p-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-200">{t('convert.step2')}</label>
            {file ? (
              <div className="flex items-center gap-3 bg-navy-800 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => setFile(null)}><X size={16} className="text-slate-400 hover:text-red-400" /></button>
              </div>
            ) : (
              <div {...getRootProps()} className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-electric-400 bg-electric-500/10' : 'border-navy-600 hover:border-navy-500'
              )}>
                <input {...getInputProps()} />
                <Upload size={32} className="mx-auto text-slate-500 mb-3" />
                <p className="text-slate-300 text-sm font-medium">{t('convert.dropFile')}</p>
                <p className="text-slate-500 text-xs mt-1">{t('convert.fileHint')}</p>
              </div>
            )}
          </div>

          <button onClick={handleConvert} disabled={!selectedCustomer || !file}
            className="w-full flex items-center justify-center gap-2 bg-electric-500 hover:bg-electric-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors text-base">
            <RefreshCw size={20} /> {t('convert.convertBtn')}
          </button>
        </>
      )}
    </div>
  )
}
