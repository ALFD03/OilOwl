/**
 * Formulario declarativo: cada campo se describe con un FieldSpec y se renderiza igual en
 * toda la aplicación. Los errores de validación del servidor se asignan a su campo.
 */
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'

import type { Resource } from '../../api/resource'
import { useStation } from '../../lib/stationContext'
import { Field } from '../ui/Field'
import { Switch } from '../ui/Switch'

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'decimal' | 'date' | 'time' | 'datetime' | 'checkbox' | 'select' | 'relation' | 'password' | 'color'

export interface FieldSpec {
  name: string
  label: string
  type?: FieldType
  required?: boolean
  hint?: string
  options?: { value: string; label: string }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resource?: Resource<any>
  optionLabel?: (item: Record<string, unknown>) => string
  /** Filtra las opciones de la relación por la estación activa. */
  stationScoped?: boolean
  params?: Record<string, string | number | boolean>
  readOnlyOnEdit?: boolean
  hideOnEdit?: boolean
  hideOnCreate?: boolean
  step?: string
  span?: 1 | 2
}

const defaultLabel = (item: Record<string, unknown>) =>
  [item.code, item.name ?? item.username ?? item.value].filter(Boolean).join(' · ') || String(item.id)

function RelationSelect({ spec, register, disabled }: { spec: FieldSpec; register: ReturnType<UseFormReturn['register']>; disabled?: boolean }) {
  const { stationId } = useStation()
  const params = { is_active: true, ...(spec.stationScoped ? { station: stationId } : {}), ...spec.params }
  const { data, isLoading } = spec.resource!.useAll(params, { enabled: !spec.stationScoped || !!stationId })
  return (
    <select className="input" {...register} disabled={disabled || isLoading}>
      <option value="">{isLoading ? 'Cargando…' : spec.required ? 'Seleccione…' : '— Ninguno —'}</option>
      {data?.map((item: Record<string, unknown>) => (
        <option key={String(item.id)} value={String(item.id)}>{(spec.optionLabel ?? defaultLabel)(item)}</option>
      ))}
    </select>
  )
}

const GRID = { 1: 'grid-cols-1', 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' } as const

export function FormFields<T extends FieldValues>({ fields, form, editing, columns = 2 }: { fields: FieldSpec[]; form: UseFormReturn<T>; editing: boolean; columns?: 1 | 2 | 3 }) {
  const { register, formState } = form
  return (
    <div className={`grid gap-x-6 gap-y-5 ${GRID[columns]}`}>
      {fields
        .filter((f) => !(editing && f.hideOnEdit) && !(!editing && f.hideOnCreate))
        .map((spec) => {
          const name = spec.name as Path<T>
          const disabled = editing && spec.readOnlyOnEdit
          const reg = register(name, {
            required: spec.required && spec.type !== 'checkbox' ? 'Campo obligatorio' : false,
            setValueAs: spec.type === 'checkbox' ? undefined : (v) => (v === '' ? (spec.required ? '' : null) : v),
          })
          const error = formState.errors[name]?.message as string | undefined
          const type = spec.type ?? 'text'
          let control
          if (type === 'checkbox') {
            return (
              <div key={spec.name} className="self-end">
                <Switch
                  label={spec.label}
                  description={spec.hint}
                  checked={!!form.watch(name)}
                  disabled={disabled}
                  onChange={(value) => form.setValue(name, value as never, { shouldDirty: true })}
                />
              </div>
            )
          } else if (type === 'select') {
            control = (
              <select className="input" {...reg} disabled={disabled}>
                <option value="">Seleccione…</option>
                {spec.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )
          } else if (type === 'relation') {
            control = <RelationSelect spec={spec} register={reg} disabled={disabled} />
          } else if (type === 'textarea') {
            control = <textarea className="input min-h-20" {...reg} disabled={disabled} />
          } else {
            const htmlType = { decimal: 'number', datetime: 'datetime-local' }[type as string] ?? type
            control = (
              <input
                className="input"
                type={htmlType}
                step={spec.step ?? (type === 'decimal' ? 'any' : undefined)}
                inputMode={type === 'decimal' || type === 'number' ? 'decimal' : undefined}
                autoComplete={type === 'password' ? 'new-password' : 'off'}
                {...reg}
                disabled={disabled}
              />
            )
          }
          return (
            <Field key={spec.name} label={spec.label + (spec.required ? ' *' : '')} error={error} hint={spec.hint} className={spec.span === 2 ? 'md:col-span-2' : ''}>
              {control}
            </Field>
          )
        })}
    </div>
  )
}
