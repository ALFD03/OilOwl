/**
 * Formulario declarativo: cada campo se describe con un FieldSpec y se renderiza igual en
 * toda la aplicación. Los errores de validación del servidor se asignan a su campo.
 */
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'

import type { Resource } from '../../api/resource'
import { useStation } from '../../lib/stationContext'
import { Field } from '../ui/Field'

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

export function FormFields<T extends FieldValues>({ fields, form, editing }: { fields: FieldSpec[]; form: UseFormReturn<T>; editing: boolean }) {
  const { register, formState } = form
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
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
              <label key={spec.name} className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" className="size-4 accent-brand-500" {...register(name)} disabled={disabled} />
                {spec.label}
              </label>
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
