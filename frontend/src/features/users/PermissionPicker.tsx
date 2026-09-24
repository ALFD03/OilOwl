/** Selector de permisos agrupados por módulo y modelo. */
import { useQuery } from '@tanstack/react-query'
import { Eye, Repeat, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { api } from '../../api/client'
import type { PermissionItem } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { ChoiceChip, SelectionActions } from '../../components/ui/ChoiceChips'

const APP_LABELS: Record<string, string> = {
  accounts: 'Usuarios', auth: 'Roles', audit: 'Auditoría', catalog: 'Catálogos', rates: 'Tasas', scheduling: 'Horarios',
  operations: 'Jornadas', closures: 'Cierres', inventory: 'Inventario', reports: 'Reportes',
}

const VERBS: Record<string, string> = { add: 'Crear', change: 'Editar', delete: 'Eliminar o desactivar', view: 'Ver' }
const MODELS: Record<string, string> = {
  user: 'usuarios', group: 'roles', permission: 'permisos', auditlog: 'la auditoría', station: 'estaciones',
  fueltype: 'combustibles', island: 'islas', pump: 'surtidores', fuelprice: 'precios', denomination: 'denominaciones',
  paymentterminal: 'puntos de venta y BioPago', attendant: 'bomberos', exchangerate: 'tasas de cambio',
  shifttemplate: 'turnos', assignment: 'horarios', shift: 'jornadas', closure: 'cierres',
  closureadjustment: 'ajustes de cierre', tank: 'tanques', tankreading: 'mediciones de tanque', delivery: 'descargas',
  reconciliation: 'conciliaciones',
}

/** Los permisos estándar de Django vienen en inglés ("Can add user"); se muestran en español. */
function permissionLabel(p: PermissionItem) {
  const match = /^(add|change|delete|view)_(\w+)$/.exec(p.code.split('.')[1] ?? '')
  if (match && p.name.startsWith('Can ')) return `${VERBS[match[1]]} ${MODELS[match[2]] ?? match[2]}`
  return p.name
}

function usePermissionsCatalog() {
  return useQuery({ queryKey: ['permissions'], queryFn: () => api<PermissionItem[]>('permissions'), staleTime: 5 * 60_000 })
}

const isView = (code: string) => /\.view_/.test(code)

export function PermissionPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const { data = [] } = usePermissionsCatalog()
  const { user } = useAuth()
  const [filter, setFilter] = useState('')
  const owned = useMemo(() => new Set(user?.permissions ?? []), [user])
  const selected = new Set(value)
  const grantable = (code: string) => !!user?.is_superuser || owned.has(code)

  const groups = useMemo(() => {
    const map = new Map<string, PermissionItem[]>()
    data
      .filter((p) => !filter || `${permissionLabel(p)} ${p.code} ${APP_LABELS[p.app_label] ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
      .forEach((p) => map.set(p.app_label, [...(map.get(p.app_label) ?? []), p]))
    return [...map.entries()]
  }, [data, filter])

  const set = (codes: string[], on: boolean) => {
    const next = new Set(selected)
    codes.forEach((c) => (on ? next.add(c) : next.delete(c)))
    onChange([...next])
  }
  const allGrantable = data.map((p) => p.code).filter(grantable)
  const visibleGrantable = groups.flatMap(([, perms]) => perms.map((p) => p.code)).filter(grantable)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <input className="input pl-10" placeholder="Filtrar por módulo o permiso…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <SelectionActions
          count={value.length}
          total={allGrantable.length}
          onAll={() => set(visibleGrantable, true)}
          onNone={() => set(visibleGrantable, false)}
          extra={
            <>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" title="Solo permisos de consulta" onClick={() => onChange(allGrantable.filter(isView))}>
                <Eye className="size-3.5" /> Solo consulta
              </button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onChange([...value.filter((c) => !visibleGrantable.includes(c)), ...visibleGrantable.filter((c) => !selected.has(c))])}>
                <Repeat className="size-3.5" /> Invertir
              </button>
            </>
          }
        />
      </div>
      <div className="space-y-3">
        {groups.map(([app, perms]) => {
          const codes = perms.filter((p) => grantable(p.code)).map((p) => p.code)
          const count = codes.filter((c) => selected.has(c)).length
          const all = codes.length > 0 && count === codes.length
          return (
            <section key={app} className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_45%,transparent)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  {APP_LABELS[app] ?? app}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${count ? 'bg-brand-500/15 text-gold' : 'text-muted bg-black/5 dark:bg-white/5'}`}>
                    {count}/{codes.length}
                  </span>
                </h4>
                <div className="flex gap-1 text-xs">
                  <button type="button" className={`btn-ghost px-2 py-1 text-xs ${all ? '' : 'text-gold'}`} onClick={() => set(codes, !all)}>
                    {all ? 'Quitar módulo' : 'Todo el módulo'}
                  </button>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => set(codes.filter(isView), true)}>Solo ver</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {perms.map((p) => (
                  <ChoiceChip
                    key={p.code}
                    selected={selected.has(p.code)}
                    disabled={!grantable(p.code)}
                    hint={grantable(p.code) ? p.code : 'No puede otorgar un permiso que usted no posee'}
                    onToggle={() => set([p.code], !selected.has(p.code))}
                  >
                    {permissionLabel(p)}
                  </ChoiceChip>
                ))}
              </div>
            </section>
          )
        })}
        {!groups.length && <p className="text-muted py-6 text-center text-sm">Ningún permiso coincide con el filtro.</p>}
      </div>
      <p className="text-muted text-xs">Solo puede otorgar permisos que usted posee.</p>
    </div>
  )
}
