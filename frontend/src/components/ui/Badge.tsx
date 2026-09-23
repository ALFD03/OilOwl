import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

const TONES = {
  gray: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
} as const

export type Tone = keyof typeof TONES

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>
}

const STATUS: Record<string, [Tone, string]> = {
  DRAFT: ['amber', 'Borrador'],
  SUBMITTED: ['blue', 'Enviado'],
  LOCKED: ['green', 'Bloqueado'],
  OVER: ['blue', 'Sobrante'],
  SHORT: ['red', 'Faltante'],
  EXACT: ['green', 'Cuadrado'],
}

export function StatusBadge({ value }: { value: string | undefined }) {
  const [tone, label] = STATUS[value ?? ''] ?? ['gray', value ?? '—']
  return <Badge tone={tone}>{label}</Badge>
}
