import type { ReactNode } from 'react'

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="text-muted mt-1.5 block text-xs">{hint}</span>}
      {error && <span className="text-negative animate-fade-in mt-1.5 block text-xs">{error}</span>}
    </label>
  )
}
