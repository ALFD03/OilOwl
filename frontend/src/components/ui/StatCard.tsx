import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export function StatCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className="text-muted text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'good' && 'text-emerald-600', tone === 'bad' && 'text-red-600')}>{value}</div>
      {sub && <div className="text-muted mt-0.5 text-xs tabular-nums">{sub}</div>}
    </div>
  )
}
