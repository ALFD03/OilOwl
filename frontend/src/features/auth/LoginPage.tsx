import { Lock, User } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthContext'
import { ErrorAlert } from '../../components/ui/Alert'
import { Field } from '../../components/ui/Field'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<unknown>(null)
  const { register, handleSubmit, formState } = useForm<{ username: string; password: string }>()

  if (user) return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null)
    try {
      await login(username, password)
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true })
    } catch (e) {
      setError(e)
    }
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Resplandor dorado de fondo */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-[42rem] -translate-x-1/2 -translate-y-[60%] rounded-full bg-brand-500/[0.09] blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="animate-fade-up mb-8 text-center">
          <img src="/brand/logo.webp" alt="OilOwl · Excelencia en gestión de energía" className="mx-auto w-56 drop-shadow-[0_12px_40px_rgba(197,160,89,0.25)]" />
        </div>
        <form onSubmit={onSubmit} className="card animate-scale-in space-y-5 p-7 [animation-delay:120ms]" noValidate>
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold">Bienvenido</h1>
            <p className="text-muted mt-1 text-sm">Ingrese para gestionar su estación</p>
          </div>
          <Field label="Usuario o correo">
            <div className="relative">
              <User className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <input className="input pl-10" autoComplete="username" autoFocus {...register('username', { required: true })} />
            </div>
          </Field>
          <Field label="Contraseña">
            <div className="relative">
              <Lock className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <input className="input pl-10" type="password" autoComplete="current-password" {...register('password', { required: true })} />
            </div>
          </Field>
          <ErrorAlert error={error} />
          <button className="btn-primary w-full py-2.5" disabled={formState.isSubmitting}>{formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <p className="text-muted mt-6 text-center text-[11px] tracking-[0.14em] uppercase">Registros protegidos e inalterables</p>
      </div>
    </div>
  )
}
