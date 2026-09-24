/** Horario semanal: asignación de bomberos a islas por día y turno. */
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { assignments, attendants, islands, shiftTemplates } from '../../api/resources'
import { usePermission } from '../../auth/AuthContext'
import { ErrorAlert } from '../../components/ui/Alert'
import { PageHeader } from '../../components/ui/PageHeader'
import { useStation } from '../../lib/stationContext'

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

function weekStart(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
  return d
}

export function SchedulePage() {
  const { stationId } = useStation()
  const [offset, setOffset] = useState(0)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = weekStart(offset); d.setDate(d.getDate() + i); return d }), [offset])
  const from = iso(days[0])
  const to = iso(days[6])
  const enabled = !!stationId
  const templates = shiftTemplates.useAll({ station: stationId, is_active: true }, { enabled })
  const islandList = islands.useAll({ station: stationId, is_active: true }, { enabled })
  const people = attendants.useAll({ station: stationId, is_active: true }, { enabled })
  const list = assignments.useAll({ station: stationId, date__gte: from, date__lte: to }, { enabled })
  const create = assignments.useCreate()
  const remove = assignments.useRemove()
  const canAdd = usePermission('scheduling.add_assignment')
  const canDelete = usePermission('scheduling.delete_assignment')
  const [template, setTemplate] = useState('')
  const activeTemplate = template || templates.data?.[0]?.id || ''

  return (
    <div>
      <PageHeader
        title="Horarios de bomberos"
        description="Asigne bomberos a cada isla por día y turno. Al abrir una isla se sugiere el bombero asignado."
        actions={
          <div className="flex items-center gap-1">
            <button className="btn-ghost p-1.5" onClick={() => setOffset(offset - 1)} aria-label="Semana anterior"><ChevronLeft className="size-4" /></button>
            <span className="text-sm tabular-nums">{from} → {to}</span>
            <button className="btn-ghost p-1.5" onClick={() => setOffset(offset + 1)} aria-label="Semana siguiente"><ChevronRight className="size-4" /></button>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {templates.data?.map((t) => (
          <button key={t.id} className={activeTemplate === t.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setTemplate(t.id)}>
            {t.name} <span className="text-xs opacity-75">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span>
          </button>
        ))}
        {!templates.data?.length && <span className="text-muted text-sm">Configure primero los turnos de la estación.</span>}
      </div>
      <ErrorAlert error={create.error ?? remove.error} />
      <div className="card animate-fade-up overflow-x-auto">
        <table className="table-base min-w-[900px]">
          <thead>
            <tr>
              <th>Isla</th>
              {days.map((d) => <th key={iso(d)}>{d.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit' })}</th>)}
            </tr>
          </thead>
          <tbody>
            {islandList.data?.map((island) => (
              <tr key={island.id}>
                <td className="font-medium">{island.name}</td>
                {days.map((d) => {
                  const day = iso(d)
                  const cell = list.data?.filter((a) => a.island === island.id && a.date === day && a.shift_template === activeTemplate) ?? []
                  return (
                    <td key={day} className="align-top">
                      <div className="space-y-1">
                        {cell.map((a) => (
                          <div key={a.id} className="animate-scale-in flex items-center justify-between gap-1 rounded-lg bg-brand-500/[0.12] px-2 py-1 text-xs text-gold ring-1 ring-brand-500/20">
                            <span className="truncate">{a.attendant_name}</span>
                            {canDelete && <button onClick={() => remove.mutate(a.id)} aria-label="Quitar"><X className="size-3" /></button>}
                          </div>
                        ))}
                        {canAdd && activeTemplate && (
                          <select
                            className="input px-1 py-0.5 text-xs"
                            value=""
                            aria-label={`Asignar bombero a ${island.name} el ${day}`}
                            onChange={(e) => e.target.value && create.mutate({ date: day, island: island.id, attendant: e.target.value, shift_template: activeTemplate } as never)}
                          >
                            <option value="">+ asignar</option>
                            {people.data?.filter((p) => !cell.some((a) => a.attendant === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
