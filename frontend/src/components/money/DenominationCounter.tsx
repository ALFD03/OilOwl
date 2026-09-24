/** Arqueo por denominación: cantidad × valor = subtotal, con total por moneda. */
import type { Denomination } from '../../api/types'
import { money } from '../../lib/format'
import { round2 } from '../../lib/closureMath'

export function DenominationCounter({
  title, denominations, counts, onChange, disabled,
}: {
  title: string
  denominations: Denomination[]
  counts: Record<string, number>
  onChange: (counts: Record<string, number>) => void
  disabled?: boolean
}) {
  const currency = (denominations[0]?.currency ?? 'USD') as 'USD' | 'VES'
  const total = round2(denominations.reduce((sum, d) => sum + Number(d.value) * (counts[d.id] ?? 0), 0))
  return (
    <div className="card card-interactive animate-fade-up p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="size-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgb(197_160_89/0.9)]" />{title}</h3>
        <span className="text-gold text-base font-semibold tabular-nums" data-testid="denomination-total">{money(total, currency)}</span>
      </div>
      <div className="space-y-1.5">
        {denominations.map((d) => {
          const qty = counts[d.id] ?? 0
          return (
            <div key={d.id} className="grid grid-cols-[5.5rem_1fr_7rem] items-center gap-2 text-sm">
              <span className="tabular-nums">{money(d.value, currency)}{d.kind === 'COIN' ? ' (m)' : ''}</span>
              <input
                className="input py-1 text-right tabular-nums"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                aria-label={`Cantidad de ${d.value} ${currency}`}
                value={qty || ''}
                placeholder="0"
                disabled={disabled}
                onChange={(e) => {
                  const value = Math.max(0, Math.floor(Number(e.target.value) || 0))
                  onChange({ ...counts, [d.id]: value })
                }}
              />
              <span className="text-muted text-right tabular-nums">{money(Number(d.value) * qty, currency)}</span>
            </div>
          )
        })}
        {!denominations.length && <p className="text-muted text-xs">No hay denominaciones activas.</p>}
      </div>
    </div>
  )
}
