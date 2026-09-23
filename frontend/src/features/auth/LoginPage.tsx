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
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6" noValidate>
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-9" />
          <div>
            <h1 className="text-lg font-semibold">OilOwl</h1>
            <p className="text-muted text-xs">Control de cierres de estaciones de servicio</p>
          </div>
        </div>
        <Field label="Usuario o correo">
          <input className="input" autoComplete="username" autoFocus {...register('username', { required: true })} />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" autoComplete="current-password" {...register('password', { required: true })} />
        </Field>
        <ErrorAlert error={error} />
        <button className="btn-primary w-full" disabled={formState.isSubmitting}>{formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  )
}
