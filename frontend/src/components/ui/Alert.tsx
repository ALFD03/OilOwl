import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'

const STYLES = {
  info: ['border-sky-500/30 bg-sky-500/5 text-sky-800 dark:text-sky-300', Info],
  success: ['border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300', CheckCircle2],
  warning: ['border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300', AlertTriangle],
  error: ['border-red-500/30 bg-red-500/5 text-red-800 dark:text-red-300', XCircle],
} as const

export function Alert({ tone = 'info', children }: { tone?: keyof typeof STYLES; children: ReactNode }) {
  const [classes, Icon] = STYLES[tone]
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', classes)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  return <Alert tone="error">{errorMessage(error)}</Alert>
}
