/** Selector de permisos agrupados por módulo y modelo. */
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { api } from '../../api/client'
import type { PermissionItem } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'

const APP_LABELS: Record<string, string> = {
  accounts: 'Usuarios', auth: 'Roles', audit: 'Auditoría', catalog: 'Catálogos', rates: 'Tasas', scheduling: 'Horarios',
  operations: 'Jornadas', closures: 'Cierres', inventory: 'Inventario', reports: 'Reportes',
}

function usePermissionsCatalog() {
  return useQuery({ queryKey: ['permissions'], queryFn: () => api<PermissionItem[]>('permissions'), staleTime: 5 * 60_000 })
}

export function PermissionPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const { data = [] } = usePermissionsCatalog()
  const { user } = useAuth()
  const [filter, setFilter] = useState('')
  const owned = useMemo(() => new Set(user?.permissions ?? []), [user])
  const selected = new Set(value)

  const groups = useMemo(() => {
    const map = new Map<string, PermissionItem[]>()
    data
      .filter((p) => !filter || `${p.name} ${p.code}`.toLowerCase().includes(filter.toLowerCase()))
      .forEach((p) => map.set(p.app_label, [...(map.get(p.app_label) ?? []), p]))
    return [...map.entries()]
  }, [data, filter])

  const toggle = (codes: string[], on: boolean) => {
    const next = new Set(selected)
    codes.forEach((c) => (on ? next.add(c) : next.delete(c)))
    onChange([...next])
  }
  const grantable = (code: string) => user?.is_superuser || owned.has(code)

  return (
    <div className="space-y-3">
      <input className="input" placeholder="Filtrar permisos…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="border-base max-h-[45vh] space-y-4 overflow-y-auto rounded-lg border p-3">
        {groups.map(([app, perms]) => {
          const codes = perms.filter((p) => grantable(p.code)).map((p) => p.code)
          const all = codes.length > 0 && codes.every((c) => selected.has(c))
          return (
            <div key={app}>
              <label className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="accent-amber-600" checked={all} onChange={(e) => toggle(codes, e.target.checked)} />
                {APP_LABELS[app] ?? app}
              </label>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 pl-6 sm:grid-cols-2">
                {perms.map((p) => (
                  <label key={p.code} className={`flex items-start gap-2 text-xs ${grantable(p.code) ? '' : 'opacity-40'}`} title={p.code}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-amber-600"
                      disabled={!grantable(p.code)}
                      checked={selected.has(p.code)}
                      onChange={(e) => toggle([p.code], e.target.checked)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-muted text-xs">{value.length} permiso(s) seleccionado(s). Solo puede otorgar permisos que usted posee.</p>
    </div>
  )
}
