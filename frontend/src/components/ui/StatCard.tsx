import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export function StatCard({ label, value, sub, tone, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad'; icon?: LucideIcon }) {
  return (
    <div className="card card-interactive animate-fade-up relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-brand-500/[0.07] blur-2xl" />
      <div className="flex items-center justify-between">
        <div className="text-muted text-[11px] font-semibold tracking-[0.08em] uppercase">{label}</div>
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-xl bg-brand-500/10 text-gold ring-1 ring-brand-500/20">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className={cn('mt-2 text-2xl font-semibold tracking-tight tabular-nums', tone === 'good' && 'text-positive', tone === 'bad' && 'text-negative')}>{value}</div>
      {sub && <div className="text-muted mt-1 text-xs tabular-nums">{sub}</div>}
    </div>
  )
}
