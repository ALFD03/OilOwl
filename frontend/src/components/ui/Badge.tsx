import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

const TONES = {
  gray: 'bg-black/[0.05] text-soft ring-black/10 dark:bg-white/[0.06] dark:ring-white/10',
  green: 'bg-positive/10 text-positive ring-positive/25',
  red: 'bg-negative/10 text-negative ring-negative/25',
  amber: 'bg-warning/10 text-warning ring-warning/25',
  blue: 'bg-info/10 text-info ring-info/25',
  gold: 'bg-brand-500/12 text-gold ring-brand-500/30',
} as const

export type Tone = keyof typeof TONES

export function Badge({ tone = 'gray', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const STATUS: Record<string, [Tone, string]> = {
  DRAFT: ['amber', 'Borrador'],
  SUBMITTED: ['blue', 'Enviado'],
  LOCKED: ['gold', 'Bloqueado'],
  OVER: ['blue', 'Sobrante'],
  SHORT: ['red', 'Faltante'],
  EXACT: ['green', 'Cuadrado'],
}

export function StatusBadge({ value }: { value: string | undefined }) {
  const [tone, label] = STATUS[value ?? ''] ?? ['gray', value ?? '—']
  return <Badge tone={tone} dot>{label}</Badge>
}
