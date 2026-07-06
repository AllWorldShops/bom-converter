import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import { useMemo, useState } from 'react'

export default function SetupAdmin() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [error, setError] = useState('')
  const schema = useMemo(() => z.object({
    username: z.string().min(2, t('setup.nameMin')),
    email: z.string().min(1, t('setup.emailRequired')).email(t('setup.emailInvalid')),
    password: z.string().min(8, t('setup.passwordMin')),
  }), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  async function onSubmit(data) {
    try {
      await api.post('/setup', data)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || t('setup.failed'))
    }
  }

  const fields = [
    { name: 'username', label: t('setup.fullName'), type: 'text', placeholder: t('setup.namePlaceholder') },
    { name: 'email', label: t('setup.email'), type: 'email', placeholder: 'admin@pecko.com' },
    { name: 'password', label: t('setup.password'), type: 'password', placeholder: t('setup.passwordPlaceholder') },
  ]

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">{t('brand.org')}</p>
          <h1 className="text-2xl font-bold text-slate-100">{t('setup.title')}</h1>
          <p className="text-slate-400 mt-2 text-sm">{t('setup.subtitle')}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-navy-900 border border-navy-700 rounded-xl p-8 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          {fields.map(({ name, label, type, placeholder }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
              <input {...register(name)} type={type} placeholder={placeholder}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
              {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name].message}</p>}
            </div>
          ))}

          <button type="submit" disabled={isSubmitting}
            className="w-full bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {isSubmitting ? t('setup.creating') : t('setup.create')}
          </button>
        </form>
      </div>
    </div>
  )
}
