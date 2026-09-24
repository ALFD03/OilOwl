import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Field } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'

interface Values {
  current_password: string
  new_password: string
  confirm: string
}

export function ChangePasswordPage() {
  const { user, reload } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const { register, handleSubmit, formState, getValues } = useForm<Values>()

  const onSubmit = handleSubmit(async ({ current_password, new_password }) => {
    setError(null)
    try {
      await api('auth/change-password', { method: 'POST', body: { current_password, new_password } })
      await reload()
      navigate('/')
    } catch (e) {
      setError(e)
    }
  })

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Cambiar contraseña" />
      <form onSubmit={onSubmit} className="card animate-fade-up space-y-4 p-6" noValidate>
        {user?.must_change_password && <Alert tone="warning">Debe cambiar su contraseña antes de continuar.</Alert>}
        <Field label="Contraseña actual">
          <input className="input" type="password" autoComplete="current-password" {...register('current_password', { required: true })} />
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 10 caracteres; evite contraseñas comunes o solo numéricas.">
          <input className="input" type="password" autoComplete="new-password" {...register('new_password', { required: true, minLength: 10 })} />
        </Field>
        <Field label="Confirmar" error={formState.errors.confirm?.message}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            {...register('confirm', { validate: (v) => v === getValues('new_password') || 'Las contraseñas no coinciden' })}
          />
        </Field>
        <ErrorAlert error={error} />
        <button className="btn-primary w-full" disabled={formState.isSubmitting}>Guardar</button>
      </form>
    </div>
  )
}
