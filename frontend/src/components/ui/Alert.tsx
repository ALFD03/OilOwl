import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'

const STYLES = {
  info: ['border-info/25 bg-info/[0.07] text-info', Info],
  success: ['border-positive/25 bg-positive/[0.07] text-positive', CheckCircle2],
  warning: ['border-warning/25 bg-warning/[0.08] text-warning', AlertTriangle],
  error: ['border-negative/25 bg-negative/[0.07] text-negative', XCircle],
} as const

export function Alert({ tone = 'info', children }: { tone?: keyof typeof STYLES; children: ReactNode }) {
  const [classes, Icon] = STYLES[tone]
  return (
    <div className={cn('animate-fade-in flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm', classes)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="text-soft min-w-0">{children}</div>
    </div>
  )
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  return <Alert tone="error">{errorMessage(error)}</Alert>
}
