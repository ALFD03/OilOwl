import { Loader2 } from 'lucide-react'

export function Spinner({ full = false, label = 'Cargando…' }: { full?: boolean; label?: string }) {
  const content = (
    <span className="text-muted inline-flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" /> {label}
    </span>
  )
  return full ? <div className="flex min-h-[40vh] items-center justify-center">{content}</div> : content
}
