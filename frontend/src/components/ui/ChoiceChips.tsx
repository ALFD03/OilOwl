import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export interface Choice {
  value: string
  label: ReactNode
  hint?: string
  disabled?: boolean
}

/** Botón seleccionable (tipo chip) para selección múltiple. */
export function ChoiceChip({ selected, onToggle, children, hint, disabled }: { selected: boolean; onToggle: () => void; children: ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      title={hint}
      onClick={onToggle}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
        selected
          ? 'border-brand-500/45 bg-brand-500/[0.14] text-gold shadow-[inset_0_0_0_1px_rgb(197_160_89/0.15)]'
          : 'text-soft border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors',
          selected ? 'border-brand-500 bg-brand-500 text-[#050a14]' : 'border-[var(--border-strong)]',
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="truncate">{children}</span>
    </button>
  )
}

/** Grupo de chips con acciones rápidas de selección. */
export function ChoiceChips({
  choices, value, onChange, bulkActions = true, empty = 'Sin opciones',
}: {
  choices: Choice[]
  value: string[]
  onChange: (value: string[]) => void
  bulkActions?: boolean
  empty?: string
}) {
  const selected = new Set(value)
  const enabled = choices.filter((c) => !c.disabled).map((c) => c.value)
  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="space-y-2.5">
      {bulkActions && choices.length > 1 && (
        <SelectionActions
          count={value.length}
          total={choices.length}
          onAll={() => onChange([...new Set([...value, ...enabled])])}
          onNone={() => onChange(value.filter((v) => !enabled.includes(v)))}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <ChoiceChip key={c.value} selected={selected.has(c.value)} onToggle={() => toggle(c.value)} hint={c.hint} disabled={c.disabled}>
            {c.label}
          </ChoiceChip>
        ))}
        {!choices.length && <span className="text-muted text-xs">{empty}</span>}
      </div>
    </div>
  )
}

/** "Seleccionar todo · Quitar todo" con contador. */
export function SelectionActions({ count, total, onAll, onNone, extra }: { count: number; total: number; onAll: () => void; onNone: () => void; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted mr-1 tabular-nums">{count} de {total} seleccionados</span>
      <button type="button" className="btn-ghost px-2 py-1 text-xs text-gold" onClick={onAll}>Seleccionar todo</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onNone}>Quitar todo</button>
      {extra}
    </div>
  )
}
