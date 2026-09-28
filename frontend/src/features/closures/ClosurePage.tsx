/**
 * Cierre de caja por isla: lecturas finales → arqueo (efectivo Bs/$, puntos, BioPago) →
 * resumen de sobrante/faltante → enviar → bloquear. El servidor es la fuente de verdad.
 *
 * `ClosureEditor` se usa tanto en su propia página (/cierres/:id) como incrustado, una vez por
 * isla, en el detalle de la jornada.
 */
import { AlertTriangle, Lock, Save, Send, ShieldCheck, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { attendants, closureAdjustments, closures, denominations, terminals } from '../../api/resources'
import type { Closure, ClosureLine, MeterReading } from '../../api/types'
import { Can } from '../../auth/Can'
import { DataTable } from '../../components/data/DataTable'
import { DenominationCounter } from '../../components/money/DenominationCounter'
import { TerminalAmountList, type TerminalEntry } from '../../components/money/TerminalAmountList'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { StatusBadge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { ConfirmModal, Modal, ModalActions } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Spinner } from '../../components/ui/Spinner'
import { readingAmounts, readingLiters, summarize, toUsd, toVes, type Currency } from '../../lib/closureMath'
import { cn } from '../../lib/cn'
import { date, dateTime, liters, money, rate, signedLiters, signedMoney } from '../../lib/format'

const METHOD_LABEL: Record<string, string> = { CASH_USD: 'Efectivo $', CASH_VES: 'Efectivo Bs', POS: 'Punto de venta', BIOPAGO: 'BioPago' }

interface Draft {
  attendant: string
  readings: Record<string, { initial: string; final: string }>
  cash: Record<string, number>
  pos: Record<string, TerminalEntry>
  bio: Record<string, TerminalEntry>
  notes: string
}

function draftFrom(closure: Closure): Draft {
  const draft: Draft = { attendant: closure.attendant ?? '', readings: {}, cash: {}, pos: {}, bio: {}, notes: closure.notes ?? '' }
  closure.readings.forEach((r: MeterReading) => {
    draft.readings[r.pump] = { initial: r.initial, final: r.final ?? '' }
  })
  closure.lines.forEach((l: ClosureLine) => {
    if (l.denomination) draft.cash[l.denomination] = (draft.cash[l.denomination] ?? 0) + (l.quantity ?? 0)
    else if (l.terminal) {
      const target = l.method === 'POS' ? draft.pos : draft.bio
      target[l.terminal] = { amount: l.amount, reference: l.reference ?? '' }
    }
  })
  return draft
}

function SummaryRow({ label, usd, ves, lit, strong, tone }: { label: string; usd: string; ves: string; lit?: string; strong?: boolean; tone?: string }) {
  return (
    <tr className={cn(strong && 'font-semibold', tone)}>
      <td>{label}</td>
      <td className="num">{usd}</td>
      <td className="num">{ves}</td>
      <td className="num">{lit ?? ''}</td>
    </tr>
  )
}

export function ClosurePage() {
  const { id } = useParams()
  return <ClosureEditor id={id!} />
}

/** Lo que una isla en borrador expone a la jornada para guardarla y enviarla junto con las demás. */
export interface IslandDraftHandle {
  island: string
  save: () => Promise<unknown>
  missingFinals: boolean
  diffUsd: number
}

/**
 * `embedded`: la isla se muestra dentro de la jornada, que guarda, envía y bloquea todas las
 * islas a la vez; por eso aquí no aparecen esos botones, solo «Devolver» para una isla enviada.
 */
export function ClosureEditor({ id, embedded = false, onRegister }: { id: string; embedded?: boolean; onRegister?: (id: string, handle: IslandDraftHandle | null) => void }) {
  const query = closures.useOne(id)
  const closure = query.data
  const editable = closure?.status === 'DRAFT'

  const denoms = denominations.useAll({ is_active: true })
  const terms = terminals.useAll({ station: closure?.station ?? '', is_active: true }, { enabled: !!closure })
  const people = attendants.useAll({ station: closure?.station ?? '', is_active: true }, { enabled: !!closure && editable })
  const save = closures.useUpdate()
  const submit = closures.useAction('submit')
  const reopen = closures.useAction<{ reason: string }>('reopen')
  const lock = closures.useAction('lock')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftVersion, setDraftVersion] = useState('')
  const [confirm, setConfirm] = useState<'submit' | 'lock' | 'reopen' | null>(null)
  const [reason, setReason] = useState('')

  // Cada vez que llega una versión nueva del servidor se reconstruye el borrador local.
  if (closure && closure.updated_at !== draftVersion) {
    setDraftVersion(closure.updated_at)
    setDraft(draftFrom(closure))
  }

  const vesDenoms = useMemo(() => denoms.data?.filter((d) => d.currency === 'VES') ?? [], [denoms.data])
  const usdDenoms = useMemo(() => denoms.data?.filter((d) => d.currency === 'USD') ?? [], [denoms.data])
  const posTerms = useMemo(() => terms.data?.filter((t) => t.kind === 'POS') ?? [], [terms.data])
  const bioTerms = useMemo(() => terms.data?.filter((t) => t.kind === 'BIOPAGO') ?? [], [terms.data])

  const payload = useMemo(() => {
    if (!draft || !closure) return null
    const lines: Record<string, unknown>[] = []
    Object.entries(draft.cash).forEach(([denomId, quantity]) => {
      const d = denoms.data?.find((x) => x.id === denomId)
      if (d && quantity > 0) lines.push({ method: d.currency === 'USD' ? 'CASH_USD' : 'CASH_VES', denomination: denomId, quantity })
    })
    const addTerminals = (entries: Record<string, TerminalEntry>, method: 'POS' | 'BIOPAGO') =>
      Object.entries(entries).forEach(([terminal, e]) => {
        if (Number(e.amount) > 0) lines.push({ method, terminal, amount: e.amount, reference: e.reference })
      })
    addTerminals(draft.pos, 'POS')
    addTerminals(draft.bio, 'BIOPAGO')
    return {
      attendant: draft.attendant || null,
      notes: draft.notes,
      readings: Object.entries(draft.readings).map(([pump, r]) => ({ pump, initial: r.initial, final: r.final === '' ? null : r.final })),
      lines,
    }
  }, [draft, closure, denoms.data])

  const preview = useMemo(() => {
    if (!draft || !closure || !payload) return null
    const rateValue = Number(closure.rate)
    const readings = closure.readings.map((r) => ({
      initial: draft.readings[r.pump]?.initial ?? r.initial,
      final: draft.readings[r.pump]?.final ?? r.final,
      price: r.price,
      price_currency: r.price_currency as Currency,
    }))
    const lines = payload.lines.map((l) => {
      if (l.denomination) {
        const d = denoms.data!.find((x) => x.id === l.denomination)!
        return { amount: Number(d.value) * Number(l.quantity), currency: d.currency as Currency }
      }
      const t = terms.data?.find((x) => x.id === l.terminal)
      return { amount: Number(l.amount), currency: (t?.currency ?? 'VES') as Currency }
    })
    return summarize(readings, lines, rateValue)
  }, [draft, closure, payload, denoms.data, terms.data])

  const methodRows = useMemo(() => {
    if (!closure) return []
    const rateValue = Number(closure.rate)
    if (!editable) {
      return closure.method_totals.map((m) => ({ method: m.method, currency: m.currency as Currency, amount: Number(m.amount), usd: Number(m.amount_usd), ves: Number(m.amount_ves) }))
    }
    const totals = new Map<string, { method: string; currency: Currency; amount: number; usd: number; ves: number }>()
    payload?.lines.forEach((l) => {
      const d = l.denomination ? denoms.data?.find((x) => x.id === l.denomination) : undefined
      const t = l.terminal ? terms.data?.find((x) => x.id === l.terminal) : undefined
      const currency = (d?.currency ?? t?.currency ?? 'VES') as Currency
      const amount = d ? Number(d.value) * Number(l.quantity) : Number(l.amount)
      const row = totals.get(String(l.method)) ?? { method: String(l.method), currency, amount: 0, usd: 0, ves: 0 }
      row.amount += amount
      row.usd += toUsd(amount, currency, rateValue)
      row.ves += toVes(amount, currency, rateValue)
      totals.set(row.method, row)
    })
    return [...totals.values()]
  }, [closure, editable, payload, denoms.data, terms.data])

  // Se publica en cada render para que la jornada siempre guarde el borrador vigente.
  useEffect(() => {
    if (!onRegister) return
    if (!closure || !draft || !payload || closure.status !== 'DRAFT') {
      onRegister(id, null)
      return
    }
    onRegister(id, {
      island: closure.island_name,
      save: () => save.mutateAsync({ id: closure.id, body: payload as never }),
      missingFinals: Object.values(draft.readings).some((r) => r.final === ''),
      diffUsd: Number(preview?.diffUsd ?? closure.diff_usd),
    })
  })
  useEffect(() => () => onRegister?.(id, null), [id, onRegister])

  if (query.isLoading || !closure || !draft) return query.error ? <ErrorAlert error={query.error} /> : <Spinner full={!embedded} />

  // En borrador se muestra la vista previa; enviado o bloqueado, las cifras oficiales del servidor.
  const s = editable && preview
    ? preview
    : {
        expectedLiters: closure.expected_liters, expectedUsd: closure.expected_usd, expectedVes: closure.expected_ves,
        declaredUsd: closure.declared_usd, declaredVes: closure.declared_ves, diffUsd: closure.diff_usd,
        diffVes: closure.diff_ves, diffLiters: closure.diff_liters, result: closure.result,
      }
  const diffTone = Number(s.diffUsd) < 0 ? 'text-negative' : Number(s.diffUsd) > 0 ? 'text-info' : 'text-positive'
  const missingFinals = Object.values(draft.readings).some((r) => r.final === '')
  const busy = save.isPending || submit.isPending || lock.isPending || reopen.isPending
  const actionError = save.error ?? submit.error ?? lock.error ?? reopen.error

  const saveDraft = () => save.mutateAsync({ id: closure.id, body: payload as never })
  const run = async () => {
    try {
      if (confirm === 'submit') {
        await saveDraft()
        await submit.mutateAsync({ id: closure.id })
      } else if (confirm === 'lock') await lock.mutateAsync({ id: closure.id })
      else if (confirm === 'reopen') await reopen.mutateAsync({ id: closure.id, body: { reason } })
      setConfirm(null)
      setReason('')
    } catch {
      setConfirm(null)
    }
  }

  const actions = (
    <>
      {editable && !embedded && (
        <>
          <Can perm="closures.change_closure">
            <button className="btn-secondary" disabled={busy} onClick={() => saveDraft().catch(() => undefined)}><Save className="size-4" /> Guardar borrador</button>
          </Can>
          <Can perm="closures.submit_closure">
            <button className="btn-primary" disabled={busy || missingFinals} title={missingFinals ? 'Faltan lecturas finales' : ''} onClick={() => setConfirm('submit')}><Send className="size-4" /> Enviar</button>
          </Can>
        </>
      )}
      {closure.status === 'SUBMITTED' && (
        <>
          <Can perm="closures.reopen_closure"><button className="btn-secondary" disabled={busy} onClick={() => setConfirm('reopen')}><Undo2 className="size-4" /> Devolver</button></Can>
          {!embedded && <Can perm="closures.lock_closure"><button className="btn-primary" disabled={busy} onClick={() => setConfirm('lock')}><Lock className="size-4" /> Bloquear</button></Can>}
        </>
      )}
    </>
  )

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">{closure.island_name}</h2>
            <div className="text-muted mt-1 inline-flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge value={closure.status} />
              {editable ? (
                <select className="input w-auto py-1 text-sm" aria-label={`Bombero de ${closure.island_name}`} value={draft.attendant} onChange={(e) => setDraft({ ...draft, attendant: e.target.value })}>
                  <option value="">— Sin bombero —</option>
                  {people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (closure.attendant_name ?? 'Sin bombero')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      ) : (
        <PageHeader
          title={`Cierre ${closure.island_name} · ${date(closure.shift_date)}`}
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge value={closure.status} /> Tasa {rate(closure.rate)} Bs/$ · {closure.attendant_name ?? 'Sin bombero'} ·{' '}
              <Link to={`/jornadas/${closure.shift}`} className="underline">Ver jornada</Link>
            </span>
          }
          actions={actions}
        />
      )}

      {closure.status === 'LOCKED' && (
        <Alert tone="success">
          <span className="inline-flex items-center gap-1 font-medium"><ShieldCheck className="size-4" /> Cierre bloqueado e inalterable</span>
          <div className="mt-1 text-xs">
            Bloqueado el {dateTime(closure.locked_at)} · eslabón #{closure.chain_seq} · huella <code className="break-all">{closure.content_hash}</code>
          </div>
        </Alert>
      )}
      {!embedded && !(Number(closure.rate) > 0) && (
        <Alert tone="error">
          La jornada tiene una tasa de cambio inválida ({rate(closure.rate)}), por lo que los pagos en bolívares no se pueden convertir a dólares.{' '}
          <Link to={`/jornadas/${closure.shift}`} className="font-medium underline">Corríjala con «Cambiar tasa» en la jornada</Link>.
        </Alert>
      )}
      <ErrorAlert error={actionError} />
      {save.isSuccess && editable && !save.isPending && <Alert tone="success">Borrador guardado.</Alert>}

      {/* Lecturas */}
      <section className="card animate-fade-up overflow-hidden">
        <h2 className="border-base border-b px-5 py-3.5 text-sm font-semibold">Lecturas de surtidores</h2>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Surtidor</th><th className="num">Inicial</th><th className="num">Final</th><th className="num">Litros</th>
                <th className="num">Precio</th><th className="num">Monto $</th><th className="num">Monto Bs</th>
              </tr>
            </thead>
            <tbody>
              {closure.readings.map((r) => {
                const d = draft.readings[r.pump]
                const lit = editable ? readingLiters({ initial: d.initial, final: d.final, price: r.price, price_currency: r.price_currency as Currency }) : Number(r.liters)
                const invalid = editable && d.final !== '' && lit === null
                const preview = editable && lit !== null ? readingAmounts({ initial: d.initial, final: d.final, price: r.price, price_currency: r.price_currency as Currency }, Number(closure.rate)) : null
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium">{r.pump_code}</div>
                      <div className="text-muted text-xs">{r.fuel_type_name}</div>
                      {r.has_gap && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning" title={`El cierre anterior terminó en ${r.expected_initial}`}>
                          <AlertTriangle className="size-3" /> Difiere del cierre anterior ({r.expected_initial})
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {editable ? (
                        <input className="input w-32 py-1 text-right tabular-nums" type="number" step="0.001" min={0} aria-label={`Inicial ${r.pump_code}`} value={d.initial} onChange={(e) => setDraft({ ...draft, readings: { ...draft.readings, [r.pump]: { ...d, initial: e.target.value } } })} />
                      ) : r.initial}
                    </td>
                    <td className="num">
                      {editable ? (
                        <input className={cn('input w-32 py-1 text-right tabular-nums', invalid && 'border-negative')} type="number" step="0.001" min={0} aria-label={`Final ${r.pump_code}`} value={d.final} onChange={(e) => setDraft({ ...draft, readings: { ...draft.readings, [r.pump]: { ...d, final: e.target.value } } })} />
                      ) : r.final}
                    </td>
                    <td className="num">{lit === null ? '—' : liters(lit)}</td>
                    <td className="num">{money(r.price, r.price_currency as Currency)}</td>
                    <td className="num">{editable ? (preview ? money(preview.usd) : '—') : money(r.amount_usd)}</td>
                    <td className="num">{editable ? (preview ? money(preview.ves, 'VES') : '—') : money(r.amount_ves, 'VES')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Arqueo */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DenominationCounter title="Efectivo en bolívares" rate={Number(closure.rate)} denominations={vesDenoms} counts={draft.cash} disabled={!editable} onChange={(cash) => setDraft({ ...draft, cash })} />
        <DenominationCounter title="Efectivo en dólares" denominations={usdDenoms} counts={draft.cash} disabled={!editable} onChange={(cash) => setDraft({ ...draft, cash })} />
        <TerminalAmountList title="Puntos de venta" rate={Number(closure.rate)} terminals={posTerms} entries={draft.pos} disabled={!editable} onChange={(pos) => setDraft({ ...draft, pos })} />
        <TerminalAmountList title="BioPago" rate={Number(closure.rate)} terminals={bioTerms} entries={draft.bio} disabled={!editable} onChange={(bio) => setDraft({ ...draft, bio })} />
      </section>

      {/* Resumen */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card animate-fade-up overflow-hidden">
          <h2 className="border-base flex items-center justify-between border-b px-5 py-3.5 text-sm font-semibold">
            Cuadre {editable && <span className="text-muted text-xs font-normal">Vista previa · se recalcula en el servidor al guardar</span>}
          </h2>
          <table className="table-base">
            <thead><tr><th /><th className="num">Dólares</th><th className="num">Bolívares</th><th className="num">Litros</th></tr></thead>
            <tbody>
              <SummaryRow label="Venta según lecturas" usd={money(s.expectedUsd)} ves={money(s.expectedVes, 'VES')} lit={liters(s.expectedLiters)} />
              <SummaryRow label="Declarado en caja" usd={money(s.declaredUsd)} ves={money(s.declaredVes, 'VES')} />
              {methodRows.map((m) => (
                <tr key={m.method} className="text-muted text-xs">
                  <td className="pl-8">
                    {METHOD_LABEL[m.method] ?? m.method}
                    <span className="ml-1.5 opacity-70">({money(m.amount, m.currency)}{m.currency === 'VES' ? ' → al cambio' : ''})</span>
                  </td>
                  <td className="num">{money(m.usd)}</td>
                  <td className="num">{money(m.ves, 'VES')}</td>
                  <td />
                </tr>
              ))}
              <SummaryRow
                label={s.result === 'OVER' ? 'Sobrante' : s.result === 'SHORT' ? 'Faltante' : 'Cuadrado'}
                usd={signedMoney(s.diffUsd)} ves={signedMoney(s.diffVes, 'VES')} lit={signedLiters(s.diffLiters)} strong tone={diffTone}
              />
            </tbody>
          </table>
        </div>
        <div className="card animate-fade-up p-5">
          <Field label="Observaciones">
            <textarea className="input min-h-28" disabled={!editable} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Field>
        </div>
      </section>

      {closure.status === 'LOCKED' && <Adjustments closure={closure} />}

      <ConfirmModal
        open={confirm === 'submit'} title="Enviar cierre" confirmLabel="Enviar" busy={busy} onClose={() => setConfirm(null)} onConfirm={run}
        message={<>Se guardará y enviará a revisión con un resultado de <strong className={diffTone}>{signedMoney(s.diffUsd)}</strong>. Ya no podrá editarlo salvo que un supervisor lo devuelva.</>}
      />
      <ConfirmModal
        open={confirm === 'lock'} title="Bloquear cierre" confirmLabel="Bloquear definitivamente" danger busy={busy} onClose={() => setConfirm(null)} onConfirm={run}
        message="El cierre quedará sellado criptográficamente y ya no podrá modificarse ni eliminarse. Las correcciones posteriores se registran como ajustes."
      />
      <ConfirmModal
        open={confirm === 'reopen'} title="Devolver a borrador" confirmLabel="Devolver" busy={busy || !reason.trim()} onClose={() => setConfirm(null)} onConfirm={run}
        message="El cierre volverá a borrador para su corrección. Quedará registrado en la auditoría."
      >
        <Field label="Motivo *"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmModal>
    </div>
  )
}

function Adjustments({ closure }: { closure: Closure }) {
  const list = closureAdjustments.useList({ closure: closure.id })
  const create = closureAdjustments.useCreate()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ reason: '', amount_usd: '0', amount_ves: '0', liters: '0' })
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Ajustes posteriores</h2>
        <Can perm="closures.add_closureadjustment"><button className="btn-secondary" onClick={() => { create.reset(); setOpen(true) }}>Registrar ajuste</button></Can>
      </div>
      <DataTable
        rows={list.data?.results}
        loading={list.isLoading}
        empty="Sin ajustes"
        columns={[
          { key: 'created_at', label: 'Fecha', render: (a) => dateTime(a.created_at) },
          { key: 'reason', label: 'Motivo' },
          { key: 'amount_usd', label: '$', numeric: true, render: (a) => signedMoney(a.amount_usd) },
          { key: 'amount_ves', label: 'Bs', numeric: true, render: (a) => signedMoney(a.amount_ves, 'VES') },
          { key: 'liters', label: 'Litros', numeric: true, render: (a) => signedLiters(a.liters) },
        ]}
      />
      <Modal open={open} title="Registrar ajuste" onClose={() => setOpen(false)} size="md">
        <div className="space-y-4">
          <Alert tone="warning">El ajuste es permanente: no podrá editarse ni eliminarse.</Alert>
          <Field label="Motivo *"><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="$"><input className="input" type="number" step="0.01" value={form.amount_usd} onChange={(e) => setForm({ ...form, amount_usd: e.target.value })} /></Field>
            <Field label="Bs"><input className="input" type="number" step="0.01" value={form.amount_ves} onChange={(e) => setForm({ ...form, amount_ves: e.target.value })} /></Field>
            <Field label="Litros"><input className="input" type="number" step="0.001" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} /></Field>
          </div>
          <ErrorAlert error={create.error} />
          <ModalActions>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={!form.reason.trim() || create.isPending} onClick={() => create.mutateAsync({ closure: closure.id, ...form } as never).then(() => setOpen(false)).catch(() => undefined)}>Guardar</button>
          </ModalActions>
        </div>
      </Modal>
    </section>
  )
}
