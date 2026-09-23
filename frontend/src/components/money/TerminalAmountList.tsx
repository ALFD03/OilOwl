/** Montos por terminal (punto de venta o BioPago) con su número de lote/referencia. */
import type { PaymentTerminal } from '../../api/types'
import { money } from '../../lib/format'
import { round2 } from '../../lib/closureMath'

export interface TerminalEntry {
  amount: string
  reference: string
}

export function TerminalAmountList({
  title, terminals, entries, onChange, disabled,
}: {
  title: string
  terminals: PaymentTerminal[]
  entries: Record<string, TerminalEntry>
  onChange: (entries: Record<string, TerminalEntry>) => void
  disabled?: boolean
}) {
  const totals = terminals.reduce<Record<string, number>>((acc, t) => {
    acc[t.currency ?? 'VES'] = round2((acc[t.currency ?? 'VES'] ?? 0) + (Number(entries[t.id]?.amount) || 0))
    return acc
  }, {})
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-sm font-semibold tabular-nums">
          {Object.entries(totals).map(([c, v]) => money(v, c as 'USD' | 'VES')).join(' + ') || money(0, 'VES')}
        </span>
      </div>
      <div className="space-y-2">
        {terminals.map((t) => {
          const entry = entries[t.id] ?? { amount: '', reference: '' }
          const update = (patch: Partial<TerminalEntry>) => onChange({ ...entries, [t.id]: { ...entry, ...patch } })
          return (
            <div key={t.id} className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[1fr_8rem_7rem]">
              <span className="truncate">{t.name}{t.bank ? <span className="text-muted"> · {t.bank}</span> : null}</span>
              <input
                className="input py-1 text-right tabular-nums"
                type="number" min={0} step="0.01" inputMode="decimal" placeholder="0,00"
                aria-label={`Monto ${t.name}`} value={entry.amount} disabled={disabled}
                onChange={(e) => update({ amount: e.target.value })}
              />
              <input className="input py-1" placeholder="Lote/ref." aria-label={`Referencia ${t.name}`} value={entry.reference} disabled={disabled} onChange={(e) => update({ reference: e.target.value })} />
            </div>
          )
        })}
        {!terminals.length && <p className="text-muted text-xs">No hay terminales activos en esta estación.</p>}
      </div>
    </div>
  )
}
