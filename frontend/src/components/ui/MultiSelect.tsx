/** Lista desplegable de selección múltiple con búsqueda (p. ej. roles de un usuario). */
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '../../lib/cn'

export interface Option {
  value: string
  label: string
  hint?: string
}

export function MultiSelect({
  options, value, onChange, placeholder = 'Seleccione…', searchPlaceholder = 'Buscar…',
}: {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = new Set(value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const visible = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
  const chosen = options.filter((o) => selected.has(o.value))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn('input flex min-h-11 items-center gap-2 text-left', open && 'border-brand-500/60 shadow-[0_0_0_4px_var(--ring)]')}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {chosen.length ? (
            chosen.map((o) => (
              <span key={o.value} className="animate-scale-in inline-flex items-center gap-1 rounded-lg bg-brand-500/[0.14] py-0.5 pr-1 pl-2 text-xs font-medium text-gold ring-1 ring-brand-500/25">
                {o.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Quitar ${o.label}`}
                  className="rounded p-0.5 hover:bg-brand-500/20"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(o.value)
                  }}
                >
                  <X className="size-3" />
                </span>
              </span>
            ))
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={cn('text-muted size-4 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="card animate-scale-in absolute inset-x-0 top-full z-30 mt-2 overflow-hidden p-0 shadow-[var(--shadow-lg)]">
          <div className="border-base flex items-center gap-2 border-b px-3">
            <Search className="text-muted size-4" />
            <input autoFocus className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-[var(--muted)]" placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="border-base flex items-center justify-between border-b px-3 py-1.5 text-xs">
            <span className="text-muted tabular-nums">{value.length} de {options.length}</span>
            <span className="flex gap-1">
              <button type="button" className="btn-ghost px-2 py-1 text-xs text-gold" onClick={() => onChange(options.map((o) => o.value))}>Seleccionar todo</button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onChange([])}>Limpiar</button>
            </span>
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1.5">
            {visible.map((o) => {
              const on = selected.has(o.value)
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.value)}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors', on ? 'bg-brand-500/[0.1] text-gold' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]')}
                  >
                    <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-md border', on ? 'border-brand-500 bg-brand-500 text-[#050a14]' : 'border-[var(--border-strong)]')}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && <span className="text-muted block text-xs">{o.hint}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
            {!visible.length && <li className="text-muted px-3 py-4 text-center text-xs">Sin resultados</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
