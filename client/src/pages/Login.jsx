import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/i18n/LanguageContext'
import { useMemo, useState } from 'react'

export default function Login() {
  const { login } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState(params.get('expired') ? t('login.expired') : '')

  const schema = useMemo(() => z.object({
    email: z.string().min(1, t('login.emailRequired')).email(t('login.emailInvalid')),
    password: z.string().min(1, t('login.passwordRequired')),
  }), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  async function onSubmit({ email, password }) {
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || t('login.signInFailed'))
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">{t('brand.org')}</p>
          <h1 className="text-3xl font-bold text-slate-100">{t('login.title')}</h1>
          <p className="text-slate-400 mt-2 text-sm">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-navy-900 border border-navy-700 rounded-xl p-8 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.email')}</label>
            <input {...register('email')} type="email" placeholder={t('login.emailPlaceholder')}
              className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.password')}</label>
            <input {...register('password')} type="password"
              className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-electric-400" />
            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting}
            className="w-full bg-electric-500 hover:bg-electric-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {isSubmitting ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>
  )
}
