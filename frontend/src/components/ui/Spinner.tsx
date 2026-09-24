export function Spinner({ full = false, label = 'Cargando…' }: { full?: boolean; label?: string }) {
  const content = (
    <span className="text-muted inline-flex items-center gap-2.5 text-sm" role="status">
      <span className="relative inline-flex size-4">
        <span className="absolute inset-0 rounded-full border-2 border-brand-500/20" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-500" />
      </span>
      {label}
    </span>
  )
  return full ? <div className="animate-fade-in flex min-h-[40vh] items-center justify-center">{content}</div> : content
}

/** Bloque de carga con brillo, para tarjetas y tablas. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}
