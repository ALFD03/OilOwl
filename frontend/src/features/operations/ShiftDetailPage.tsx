import { Lock, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { assignments, attendants, closures, islands, pumps, shifts } from '../../api/resources'
import type { ClosureListItem, Island, Shift } from '../../api/types'
import { Can } from '../../auth/Can'
import { ErrorAlert } from '../../components/ui/Alert'
import { StatusBadge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { ConfirmModal, Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Spinner } from '../../components/ui/Spinner'
import { date, liters, money, rate, signedMoney } from '../../lib/format'

function OpenIslandModal({ shift, island, onClose }: { shift: Shift; island: Island; onClose: () => void }) {
  const navigate = useNavigate()
  const pumpList = pumps.useAll({ island: island.id, is_active: true })
  const people = attendants.useAll({ station: shift.station, is_active: true })
  const planned = assignments.useAll({ date: shift.date, island: island.id })
  const [attendant, setAttendant] = useState('')
  const [initials, setInitials] = useState<Record<string, string>>({})
  const create = closures.useCreate()
  const suggested = planned.data?.find((a) => !shift.shift_template || a.shift_template === shift.shift_template)?.attendant

  const submit = async () => {
    const filled = Object.fromEntries(Object.entries(initials).filter(([, v]) => v !== ''))
    try {
      const closure = await create.mutateAsync({ shift: shift.id, island: island.id, attendant: attendant || suggested || null, initials: filled } as never)
      navigate(`/cierres/${closure.id}`)
    } catch {
      /* se muestra */
    }
  }

  return (
    <Modal open title={`Abrir ${island.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Bombero responsable" hint={suggested ? 'Sugerido según el horario.' : undefined}>
          <select className="input" value={attendant || suggested || ''} onChange={(e) => setAttendant(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div>
          <span className="label">Lecturas iniciales</span>
          <p className="text-muted mb-2 text-xs">Déjelas vacías para tomar la lectura final del cierre anterior de cada surtidor.</p>
          {pumpList.isLoading ? <Spinner /> : (
            <div className="space-y-2">
              {pumpList.data?.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_10rem] items-center gap-2 text-sm">
                  <span>{p.code} · {p.fuel_type_name}</span>
                  <input className="input py-1 text-right tabular-nums" type="number" step="0.001" min={0} placeholder="Automática" value={initials[p.id] ?? ''} onChange={(e) => setInitials({ ...initials, [p.id]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
        </div>
        <ErrorAlert error={create.error} />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={create.isPending} onClick={submit}>Abrir isla</button>
        </div>
      </div>
    </Modal>
  )
}

export function ShiftDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const shift = shifts.useOne(id)
  const islandList = islands.useAll({ station: shift.data?.station ?? '', is_active: true }, { enabled: !!shift.data })
  const closureList = closures.useList({ shift: id, page_size: 100 }, { enabled: !!id })
  const close = shifts.useAction('close')
  const [opening, setOpening] = useState<Island | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  if (shift.isLoading || !shift.data) return shift.error ? <ErrorAlert error={shift.error} /> : <Spinner full />
  const s = shift.data
  const byIsland = new Map<string, ClosureListItem>((closureList.data?.results as ClosureListItem[] | undefined)?.map((c) => [c.island, c]) ?? [])
  const all = [...byIsland.values()]
  const allLocked = all.length > 0 && all.every((c) => c.status === 'LOCKED')
  const totals = all.reduce(
    (acc, c) => ({ liters: acc.liters + Number(c.expected_liters), usd: acc.usd + Number(c.expected_usd), diff: acc.diff + Number(c.diff_usd) }),
    { liters: 0, usd: 0, diff: 0 },
  )

  return (
    <div>
      <PageHeader
        title={`Jornada ${date(s.date)}${s.shift_name ? ` · ${s.shift_name}` : ''}`}
        description={<>Tasa congelada: <strong>{rate(s.rate)} Bs/$</strong> · <StatusBadge value={s.status} /></>}
        actions={
          s.status === 'DRAFT' && (
            <Can perm="operations.close_shift">
              <button className="btn-primary" disabled={!allLocked} title={allLocked ? '' : 'Todas las islas abiertas deben estar bloqueadas'} onClick={() => { close.reset(); setConfirmClose(true) }}>
                <Lock className="size-4" /> Cerrar jornada
              </button>
            </Can>
          )
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="label">Litros</div><div className="text-xl font-semibold tabular-nums">{liters(totals.liters)}</div></div>
        <div className="card p-4"><div className="label">Ventas</div><div className="text-xl font-semibold tabular-nums">{money(totals.usd)}</div></div>
        <div className="card p-4"><div className="label">Sobrante / faltante</div><div className={`text-xl font-semibold tabular-nums ${totals.diff < 0 ? 'text-red-600' : totals.diff > 0 ? 'text-sky-600' : ''}`}>{signedMoney(totals.diff)}</div></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {islandList.data?.map((island) => {
          const closure = byIsland.get(island.id)
          return (
            <div key={island.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{island.name}</h3>
                {closure ? <StatusBadge value={closure.status} /> : <span className="text-muted text-xs">Sin abrir</span>}
              </div>
              {closure ? (
                <>
                  <div className="text-muted text-sm">{closure.attendant_name ?? 'Sin bombero'}</div>
                  <div className="flex justify-between text-sm tabular-nums">
                    <span>{liters(closure.expected_liters)}</span>
                    <span>{money(closure.expected_usd)}</span>
                    {closure.status !== 'DRAFT' && <StatusBadge value={closure.result} />}
                  </div>
                  <Link className="btn-secondary" to={`/cierres/${closure.id}`}>{closure.status === 'DRAFT' ? 'Registrar cierre' : 'Ver cierre'}</Link>
                </>
              ) : (
                s.status === 'DRAFT' && (
                  <Can perm="closures.add_closure">
                    <button className="btn-secondary" onClick={() => setOpening(island)}><PlayCircle className="size-4" /> Abrir isla</button>
                  </Can>
                )
              )}
            </div>
          )
        })}
      </div>
      {opening && <OpenIslandModal shift={s} island={opening} onClose={() => setOpening(null)} />}
      <ConfirmModal
        open={confirmClose}
        title="Cerrar jornada"
        message="Se bloqueará la jornada y se conciliarán los tanques con su última medición. Esta acción no se puede deshacer."
        confirmLabel="Cerrar jornada"
        busy={close.isPending}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => close.mutateAsync({ id: s.id }).then(() => { setConfirmClose(false); shift.refetch(); navigate(`/jornadas/${s.id}`) }).catch(() => undefined)}
      >
        <ErrorAlert error={close.error} />
      </ConfirmModal>
    </div>
  )
}
