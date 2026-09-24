import { cn } from '../../lib/cn'

/** Interruptor para opciones sí/no (reemplaza las casillas de verificación). */
export function Switch({
  checked, onChange, label, description, disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all duration-200 disabled:opacity-50',
        checked ? 'border-brand-500/35 bg-brand-500/[0.08]' : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="text-muted mt-0.5 block text-xs">{description}</span>}
      </span>
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-brand-500 shadow-[var(--glow)]' : 'bg-black/15 dark:bg-white/15',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 size-5 rounded-full bg-white shadow-md transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}
