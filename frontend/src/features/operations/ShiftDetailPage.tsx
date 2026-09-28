/**
 * Detalle de la jornada: todo se registra en una sola página.
 *   1. Medición inicial de tanques (al abrir la jornada).
 *   2. Cada isla con su cierre completo (lecturas, arqueo y cuadre), una debajo de otra. Guardar,
 *      enviar y bloquear son acciones de la jornada: actúan sobre todas las islas a la vez.
 *   3. Recepción de combustible durante la jornada.
 *   4. Cierre de jornada: medición final de tanques → conciliación y merma.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Fuel, Lock, PlayCircle, RefreshCw, Save, Scale, Send, Truck } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '../../api/client'
import { assignments, attendants, closures, deliveries, exchangeRates, islands, pumps, shifts } from '../../api/resources'
import type { ClosureListItem, Delivery, Island, Shift, ShiftTank } from '../../api/types'
import { usePermission } from '../../auth/AuthContext'
import { Can } from '../../auth/Can'
import { DataTable } from '../../components/data/DataTable'
import { TankHeightInputs, type TankHeightRow } from '../../components/inventory/TankHeightInputs'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { ConfirmModal, Modal, ModalActions } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Spinner } from '../../components/ui/Spinner'
import { StatCard } from '../../components/ui/StatCard'
import { cn } from '../../lib/cn'
import { date, dateTime, liters, money, nowLocal, rate, signedLiters, signedMoney, time } from '../../lib/format'
import { tankHeightsComplete, toTankReadings, type TankHeights } from '../../lib/tankMath'
import { ClosureEditor, type IslandDraftHandle } from '../closures/ClosurePage'

/** Inventario de la jornada. La clave incluye una firma de cierres y recepciones para refrescarse con ellos. */
function useShiftTanks(id: string, signature: string) {
  return useQuery({
    queryKey: [...shifts.key, 'tanks', id, signature],
    queryFn: () => api<ShiftTank[]>(`shifts/${id}/tanks`),
    placeholderData: (previous) => previous,
  })
}

// ----------------------------------------------------------------------------- islas

function OpenIslandCard({ shift, island }: { shift: Shift; island: Island }) {
  const pumpList = pumps.useAll({ island: island.id, is_active: true })
  const people = attendants.useAll({ station: shift.station, is_active: true })
  const planned = assignments.useAll({ date: shift.date, island: island.id })
  const [attendant, setAttendant] = useState('')
  const [initials, setInitials] = useState<Record<string, string>>({})
  const create = closures.useCreate()
  const suggested = planned.data?.find((a) => !shift.shift_template || a.shift_template === shift.shift_template)?.attendant

  const submit = () => {
    const filled = Object.fromEntries(Object.entries(initials).filter(([, v]) => v !== ''))
    create.mutateAsync({ shift: shift.id, island: island.id, attendant: attendant || suggested || null, initials: filled } as never).catch(() => undefined)
  }

  return (
    <div className="card animate-fade-up space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{island.name}</h2>
        <span className="text-muted text-xs">Sin abrir</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pumpList.data?.map((p) => (
                <label key={p.id} className="grid grid-cols-[1fr_9rem] items-center gap-2 text-sm">
                  <span>{p.code} · {p.fuel_type_name}</span>
                  <input className="input py-1 text-right tabular-nums" type="number" step="0.001" min={0} placeholder="Automática" value={initials[p.id] ?? ''} onChange={(e) => setInitials({ ...initials, [p.id]: e.target.value })} />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <ErrorAlert error={create.error} />
      <div className="flex justify-end">
        <button className="btn-primary" disabled={create.isPending} onClick={submit}><PlayCircle className="size-4" /> Abrir isla</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- recepción y tanques

function DeliveryModal({ shift, tanks, onClose }: { shift: Shift; tanks: ShiftTank[]; onClose: () => void }) {
  const create = deliveries.useCreate()
  const [form, setForm] = useState({ tank: tanks.length === 1 ? tanks[0].tank : '', liters: '', document: '', supplier: '', delivered_at: nowLocal() })
  const valid = form.tank && Number(form.liters) > 0 && form.delivered_at

  const submit = () =>
    create
      .mutateAsync({ ...form, shift: shift.id, delivered_at: new Date(form.delivered_at).toISOString() } as never)
      .then(onClose)
      .catch(() => undefined)

  return (
    <Modal open title="Registrar recepción de combustible" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tanque *">
            <select className="input" value={form.tank} onChange={(e) => setForm({ ...form, tank: e.target.value })}>
              <option value="">Seleccione…</option>
              {tanks.map((t) => <option key={t.tank} value={t.tank}>{t.tank_code} · {t.tank_name} ({t.fuel_type_name})</option>)}
            </select>
          </Field>
          <Field label="Litros recibidos *">
            <input className="input" type="number" step="0.001" min={0} value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} />
          </Field>
          <Field label="Guía / factura"><input className="input" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
          <Field label="Proveedor"><input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          <Field label="Fecha y hora de descarga *">
            <input className="input" type="datetime-local" value={form.delivered_at} onChange={(e) => setForm({ ...form, delivered_at: e.target.value })} />
          </Field>
        </div>
        <Alert tone="warning">La recepción es permanente: no podrá editarse ni eliminarse. Cuenta en la conciliación de esta jornada.</Alert>
        <ErrorAlert error={create.error} />
        <ModalActions>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!valid || create.isPending} onClick={submit}>Registrar</button>
        </ModalActions>
      </div>
    </Modal>
  )
}

function Height({ reading }: { reading: ShiftTank['opening'] }) {
  if (!reading) return <span className="text-muted">—</span>
  return (
    <div>
      {liters(reading.liters)}
      <div className="text-muted text-xs" title={dateTime(reading.measured_at)}>{reading.height_cm !== null ? `${Number(reading.height_cm)} cm · ` : ''}{time(reading.measured_at)}</div>
    </div>
  )
}

function TanksSection({ shift, tanks, loading, deliveryList }: { shift: Shift; tanks: ShiftTank[] | undefined; loading: boolean; deliveryList: Delivery[] | undefined }) {
  const [receiving, setReceiving] = useState(false)
  const open = shift.status === 'DRAFT'
  return (
    <section id="tanques" className="scroll-mt-36 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Tanques, recepción y merma</h2>
          <p className="text-muted mt-1 text-sm">Esperado = apertura + recepciones − vendido en las islas. Al cerrar la jornada se mide de nuevo y la diferencia es la merma.</p>
        </div>
        {open && (
          <Can perm="inventory.add_delivery">
            <button className="btn-secondary" disabled={!tanks?.length} onClick={() => setReceiving(true)}><Truck className="size-4" /> Registrar recepción</button>
          </Can>
        )}
      </div>

      <DataTable<ShiftTank>
        rows={tanks}
        rowKey={(t) => t.tank}
        loading={loading}
        empty="La estación no tiene tanques activos"
        columns={[
          { key: 'tank_name', label: 'Tanque', className: 'min-w-44', render: (t) => <div><div className="font-medium">{t.tank_code} · {t.tank_name}</div><div className="text-muted text-xs">{t.fuel_type_name}</div></div> },
          { key: 'opening', className: 'whitespace-nowrap', label: 'Apertura', numeric: true, render: (t) => <Height reading={t.opening} /> },
          { key: 'deliveries_liters', className: 'whitespace-nowrap', label: '+ Recepciones', numeric: true, render: (t) => (t.deliveries_liters === null ? '—' : liters(t.deliveries_liters)) },
          { key: 'sold_liters', className: 'whitespace-nowrap', label: '− Vendido', numeric: true, render: (t) => (t.sold_liters === null ? '—' : liters(t.sold_liters)) },
          { key: 'expected_liters', className: 'whitespace-nowrap', label: 'Esperado', numeric: true, render: (t) => (t.expected_liters === null ? '—' : liters(t.expected_liters)) },
          { key: 'closing', className: 'whitespace-nowrap', label: 'Cierre', numeric: true, render: (t) => <Height reading={t.closing} /> },
          {
            key: 'reconciliation', label: 'Merma', numeric: true, className: 'whitespace-nowrap',
            render: (t) => {
              const r = t.reconciliation
              if (!r) return <span className="text-muted text-xs">{open ? 'Al cerrar la jornada' : '—'}</span>
              return (
                <div className="flex flex-col items-end gap-0.5">
                  <span className={Number(r.variance_liters) < 0 ? 'text-negative' : ''}>{signedLiters(r.variance_liters)} ({Number(r.variance_pct).toFixed(2)} %)</span>
                  <span className="text-muted text-xs">{signedMoney(r.variance_usd)} · {signedMoney(r.variance_ves, 'VES')}</span>
                  {r.within_tolerance ? <Badge tone="green">Dentro de tolerancia</Badge> : <Badge tone="red">Fuera de tolerancia</Badge>}
                </div>
              )
            },
          },
        ]}
      />

      <div>
        <h3 className="mb-2 text-sm font-semibold">Recepciones de combustible de la jornada</h3>
        <DataTable<Delivery>
          rows={deliveryList}
          loading={!deliveryList}
          empty="Sin recepciones registradas"
          columns={[
            { key: 'delivered_at', label: 'Fecha', render: (d) => dateTime(d.delivered_at) },
            { key: 'tank_name', label: 'Tanque' },
            { key: 'liters', label: 'Litros', numeric: true, render: (d) => liters(d.liters) },
            { key: 'document', label: 'Guía' },
            { key: 'supplier', label: 'Proveedor' },
          ]}
        />
      </div>
      {receiving && tanks && <DeliveryModal shift={shift} tanks={tanks} onClose={() => setReceiving(false)} />}
    </section>
  )
}

// ----------------------------------------------------------------------------- cierre de jornada

function CloseShiftModal({ shift, tanks, onClose, onClosed }: { shift: Shift; tanks: ShiftTank[]; onClose: () => void; onClosed: () => void }) {
  const close = shifts.useAction<{ tank_readings: { tank: string; height_cm: string }[] }>('close')
  const [heights, setHeights] = useState<TankHeights>({})
  const rows: TankHeightRow[] = tanks.map((t) => ({
    id: t.tank, code: t.tank_code, name: t.tank_name, fuel: t.fuel_type_name, calibration: t.calibration,
    expected: t.expected_liters === null ? null : Number(t.expected_liters),
    sold: t.sold_liters === null ? null : Number(t.sold_liters),
    tolerancePct: Number(t.tolerance_pct),
  }))
  const ready = tankHeightsComplete(rows, heights)

  const submit = () =>
    close
      .mutateAsync({ id: shift.id, body: { tank_readings: toTankReadings(rows, heights) } })
      .then(onClosed)
      .catch(() => undefined)

  return (
    <Modal open title="Cerrar jornada" onClose={onClose} size="lg" description="Mida los tanques en cm. Se conciliarán contra lo esperado y la jornada quedará bloqueada; esta acción no se puede deshacer.">
      <div className="space-y-4">
        <TankHeightInputs rows={rows} values={heights} onChange={setHeights} />
        <p className="text-muted text-xs">La diferencia es una vista previa; el servidor la recalcula al cerrar.</p>
        <ErrorAlert error={close.error} />
        <ModalActions>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!ready || close.isPending} title={ready ? '' : 'Indique la medición en cm de cada tanque'} onClick={submit}>
            <Lock className="size-4" /> Cerrar jornada
          </button>
        </ModalActions>
      </div>
    </Modal>
  )
}

// ----------------------------------------------------------------------------- acciones de todas las islas

type BulkStep = 'save' | 'submit' | 'lock'

/**
 * Guardar, enviar y bloquear actúan sobre todas las islas de la jornada a la vez. Cada isla en
 * borrador registra su estado local (`IslandDraftHandle`) para poder guardarse antes de enviar.
 */
function IslandsActions({ shift, closureRows, handles }: { shift: Shift; closureRows: ClosureListItem[]; handles: { current: Map<string, IslandDraftHandle> } }) {
  const queryClient = useQueryClient()
  const submitAll = shifts.useAction('submit-closures')
  const lockAll = shifts.useAction('lock-closures')
  const [confirm, setConfirm] = useState<{ step: BulkStep; islands: IslandDraftHandle[] } | null>(null)
  const [busy, setBusy] = useState<BulkStep | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)

  const drafts = closureRows.filter((c) => c.status === 'DRAFT')
  const submitted = closureRows.filter((c) => c.status === 'SUBMITTED')
  if (shift.status !== 'DRAFT' || (!drafts.length && !submitted.length)) return null

  const refresh = () => queryClient.invalidateQueries({ queryKey: closures.key })
  const saveAll = async () => {
    for (const handle of handles.current.values()) await handle.save()
  }
  const run = async (step: BulkStep) => {
    setBusy(step)
    setError(null)
    setSaved(false)
    try {
      if (step !== 'lock') await saveAll()
      if (step === 'submit') await submitAll.mutateAsync({ id: shift.id })
      if (step === 'lock') await lockAll.mutateAsync({ id: shift.id })
      if (step === 'save') setSaved(true)
      setConfirm(null)
    } catch (e) {
      setError(e)
      setConfirm(null)
    } finally {
      await refresh()
      setBusy(null)
    }
  }
  const snapshot = () => [...handles.current.values()]
  const missing = (islands: IslandDraftHandle[]) => islands.filter((h) => h.missingFinals)

  return (
    <>
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        {saved && !busy && <span className="text-positive text-xs whitespace-nowrap">Guardado</span>}
        {drafts.length > 0 && (
          <>
            <Can perm="closures.change_closure">
              <button className="btn-secondary shrink-0 py-1.5 text-sm whitespace-nowrap" disabled={!!busy} onClick={() => run('save')}>
                <Save className="size-4" /> {busy === 'save' ? 'Guardando…' : 'Guardar'}
              </button>
            </Can>
            <Can perm="closures.submit_closure">
              <button className="btn-primary shrink-0 py-1.5 text-sm whitespace-nowrap" disabled={!!busy} onClick={() => { setError(null); setConfirm({ step: 'submit', islands: snapshot() }) }}>
                <Send className="size-4" /> Enviar islas ({drafts.length})
              </button>
            </Can>
          </>
        )}
        {!drafts.length && submitted.length > 0 && (
          <Can perm="closures.lock_closure">
            <button className="btn-primary shrink-0 py-1.5 text-sm whitespace-nowrap" disabled={!!busy} onClick={() => { setError(null); setConfirm({ step: 'lock', islands: [] }) }}>
              <Lock className="size-4" /> Bloquear islas ({submitted.length})
            </button>
          </Can>
        )}
      </div>

      {error !== null && (
        <Modal open title="No se pudo completar" onClose={() => setError(null)} size="sm">
          <div className="space-y-4">
            <ErrorAlert error={error} />
            <ModalActions><button className="btn-primary" onClick={() => setError(null)}>Entendido</button></ModalActions>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={confirm?.step === 'submit'} title="Enviar todas las islas" confirmLabel="Guardar y enviar"
        busy={busy === 'submit' || (confirm !== null && missing(confirm.islands).length > 0)}
        onClose={() => setConfirm(null)} onConfirm={() => run('submit')}
        message="Se guardarán y enviarán a revisión todas las islas juntas. Ya no podrán editarse salvo que un supervisor devuelva alguna."
      >
        {confirm?.step === 'submit' && (
          <div className="space-y-2">
            <table className="table-base">
              <tbody>
                {confirm.islands.map((h) => (
                  <tr key={h.island}>
                    <td>{h.island}</td>
                    <td className="num">
                      {h.missingFinals
                        ? <span className="text-warning">Faltan lecturas finales</span>
                        : <span className={h.diffUsd < 0 ? 'text-negative' : h.diffUsd > 0 ? 'text-info' : 'text-positive'}>{signedMoney(h.diffUsd)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {missing(confirm.islands).length > 0 && <Alert tone="warning">Complete las lecturas finales de todas las islas para poder enviarlas.</Alert>}
          </div>
        )}
      </ConfirmModal>
      <ConfirmModal
        open={confirm?.step === 'lock'} title="Bloquear todas las islas" confirmLabel="Bloquear definitivamente" danger
        busy={busy === 'lock'} onClose={() => setConfirm(null)} onConfirm={() => run('lock')}
        message={`Se sellarán criptográficamente las ${submitted.length} islas enviadas y ya no podrán modificarse ni eliminarse. Las correcciones posteriores se registran como ajustes.`}
      />
    </>
  )
}

/** Corrige la tasa de una jornada abierta: BCV vigente o tasa manual (con permiso). */
function SetRateModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const canOverride = usePermission('rates.override_rate')
  const current = exchangeRates.useList({ page_size: 1 })
  const setRate = shifts.useAction<{ rate?: string }>('set-rate')
  const [manual, setManual] = useState('')
  const latest = current.data?.results[0]
  const invalidManual = manual !== '' && !(Number(manual) > 0)

  const apply = (body: { rate?: string }) =>
    setRate.mutateAsync({ id: shift.id, body }).then(onClose).catch(() => undefined)

  return (
    <Modal open title="Cambiar tasa de la jornada" onClose={onClose} size="md">
      <div className="space-y-4 text-sm">
        <p className="text-soft">
          Tasa actual: <strong>{rate(shift.rate)} Bs/$</strong>. Los cierres de esta jornada (todos deben estar en borrador) se recalculan con la nueva tasa.
        </p>
        {latest && (
          <button className="btn-secondary w-full justify-between" disabled={setRate.isPending} onClick={() => apply({})}>
            <span>Usar la tasa BCV vigente</span>
            <strong className="text-gold">{rate(latest.rate)} Bs/$ · {date(latest.valid_date)}</strong>
          </button>
        )}
        {canOverride && (
          <Field label="O tasa manual (Bs por $)" error={invalidManual ? 'La tasa debe ser mayor que cero' : undefined}>
            <div className="flex gap-2">
              <input className="input" type="number" min="0.000001" step="any" value={manual} onChange={(e) => setManual(e.target.value)} />
              <button className="btn-primary" disabled={!manual || invalidManual || setRate.isPending} onClick={() => apply({ rate: manual })}>Aplicar</button>
            </div>
          </Field>
        )}
        <ErrorAlert error={setRate.error} />
      </div>
    </Modal>
  )
}

// ----------------------------------------------------------------------------- página

export function ShiftDetailPage() {
  const { id = '' } = useParams()
  const shift = shifts.useOne(id)
  const islandList = islands.useAll({ station: shift.data?.station ?? '', is_active: true }, { enabled: !!shift.data })
  const closureList = closures.useList({ shift: id, page_size: 100 }, { enabled: !!id })
  const deliveryList = deliveries.useList({ shift: id, page_size: 100, ordering: '-delivered_at' }, { enabled: !!id })
  const closureRows = (closureList.data?.results as ClosureListItem[] | undefined) ?? []
  const signature = [...closureRows.map((c) => c.updated_at), deliveryList.data?.count ?? 0].join('|')
  const tanks = useShiftTanks(id, signature)
  const [closing, setClosing] = useState(false)
  const [changingRate, setChangingRate] = useState(false)
  // Borradores de las islas, para guardarlos y enviarlos todos juntos.
  const handles = useRef(new Map<string, IslandDraftHandle>())
  const register = useCallback((closureId: string, handle: IslandDraftHandle | null) => {
    if (handle) handles.current.set(closureId, handle)
    else handles.current.delete(closureId)
  }, [])

  if (shift.isLoading || !shift.data) return shift.error ? <ErrorAlert error={shift.error} /> : <Spinner full />
  const s = shift.data
  const byIsland = new Map<string, ClosureListItem>(closureRows.map((c) => [c.island, c]))
  const allLocked = closureRows.length > 0 && closureRows.every((c) => c.status === 'LOCKED')
  const totals = closureRows.reduce(
    (acc, c) => ({ liters: acc.liters + Number(c.expected_liters), usd: acc.usd + Number(c.expected_usd), diff: acc.diff + Number(c.diff_usd) }),
    { liters: 0, usd: 0, diff: 0 },
  )
  // Islas con cierre en esta jornada aunque hoy estén inactivas, más las activas sin abrir.
  const islandRows = [
    ...(islandList.data ?? []),
    ...closureRows.filter((c) => !islandList.data?.some((i) => i.id === c.island)).map((c) => ({ id: c.island, name: c.island_name }) as Island),
  ]
  const shrinkage = tanks.data?.filter((t) => t.reconciliation).reduce((acc, t) => acc + Number(t.reconciliation!.variance_usd), 0)

  return (
    <div className="space-y-8">
      <div id="resumen" className="scroll-mt-36">
        <PageHeader
          title={`Jornada ${date(s.date)}${s.shift_name ? ` · ${s.shift_name}` : ''}`}
          description={<>Tasa congelada: <strong>{rate(s.rate)} Bs/$</strong> · <StatusBadge value={s.status} /></>}
          actions={
            s.status === 'DRAFT' && (
              <>
                <Can perm="operations.change_shift">
                  <button className="btn-secondary" onClick={() => setChangingRate(true)}>
                    <RefreshCw className="size-4" /> Cambiar tasa
                  </button>
                </Can>
                <Can perm="operations.close_shift">
                  <button className="btn-primary" disabled={!allLocked || !tanks.data} title={allLocked ? '' : 'Todas las islas abiertas deben estar bloqueadas'} onClick={() => setClosing(true)}>
                    <Lock className="size-4" /> Cerrar jornada
                  </button>
                </Can>
              </>
            )
          }
        />
        {!(Number(s.rate) > 0) && (
          <div className="mb-4">
            <Alert tone="error">La tasa de esta jornada es inválida ({rate(s.rate)}): los pagos en bolívares no se pueden convertir. Use «Cambiar tasa».</Alert>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Fuel} label="Litros" value={liters(totals.liters)} />
          <StatCard icon={DollarSign} label="Ventas" value={money(totals.usd)} />
          <StatCard icon={Scale} label="Sobrante / faltante" value={signedMoney(totals.diff)} tone={totals.diff < 0 ? 'bad' : undefined} />
          <StatCard
            icon={Truck} label="Merma de tanques"
            value={shrinkage === undefined || s.status === 'DRAFT' ? '—' : signedMoney(shrinkage)}
            sub={s.status === 'DRAFT' ? 'Se calcula al cerrar la jornada' : undefined}
            tone={shrinkage !== undefined && shrinkage < 0 ? 'bad' : undefined}
          />
        </div>
      </div>

      {/* Acceso rápido a cada isla y a los tanques: fijo bajo la cabecera mientras se desplaza */}
      <nav className="border-base sticky top-[4.25rem] z-20 -mx-2 flex items-center gap-2 overflow-x-auto rounded-2xl border bg-[var(--surface)] px-2 py-2 shadow-[var(--shadow-lg)]" aria-label="Secciones de la jornada">
        <a href="#resumen" className="btn-ghost shrink-0 py-1.5 text-sm whitespace-nowrap">Resumen</a>
        {islandRows.map((island) => {
          const closure = byIsland.get(island.id)
          return (
            <a key={island.id} href={`#isla-${island.id}`} className="btn-secondary shrink-0 py-1.5 text-sm whitespace-nowrap">
              {island.name} {closure ? <StatusBadge value={closure.status} /> : <span className="text-muted text-xs">Sin abrir</span>}
            </a>
          )
        })}
        <a href="#tanques" className="btn-secondary shrink-0 py-1.5 text-sm whitespace-nowrap"><Truck className="size-4" /> Tanques y merma</a>
        <IslandsActions shift={s} closureRows={closureRows} handles={handles} />
      </nav>

      {islandList.isLoading || closureList.isLoading ? <Spinner /> : islandRows.map((island) => {
        const closure = byIsland.get(island.id)
        return (
          <section key={island.id} id={`isla-${island.id}`} className={cn('scroll-mt-36', closure && 'border-base border-t pt-6')}>
            {closure ? (
              <ClosureEditor id={closure.id} embedded onRegister={register} />
            ) : s.status === 'DRAFT' ? (
              <Can perm="closures.add_closure" fallback={<p className="text-muted text-sm">{island.name}: sin abrir.</p>}>
                <OpenIslandCard shift={s} island={island} />
              </Can>
            ) : (
              <p className="text-muted text-sm">{island.name}: no se abrió en esta jornada.</p>
            )}
          </section>
        )
      })}

      <div className="border-base border-t pt-6">
        <TanksSection shift={s} tanks={tanks.data} loading={tanks.isLoading} deliveryList={deliveryList.data?.results} />
      </div>

      {changingRate && <SetRateModal shift={s} onClose={() => setChangingRate(false)} />}
      {closing && tanks.data && (
        <CloseShiftModal shift={s} tanks={tanks.data} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); shift.refetch() }} />
      )}
    </div>
  )
}
