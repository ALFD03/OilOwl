import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { Spinner } from '../ui/Spinner'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => ReactNode
  className?: string
  numeric?: boolean
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  loading?: boolean
  empty?: string
  rowKey?: (row: T) => string
  onRowClick?: (row: T) => void
  actions?: (row: T) => ReactNode
  footer?: ReactNode
}

export function DataTable<T extends object>({ columns, rows, loading, empty = 'Sin registros', rowKey, onRowClick, actions, footer }: Props<T>) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn(c.numeric && 'num', c.className)}>{c.label}</th>
              ))}
              {actions && <th className="w-px" />}
            </tr>
          </thead>
          <tbody>
            {loading && !rows?.length && (
              <tr><td colSpan={columns.length + 1} className="py-8 text-center"><Spinner /></td></tr>
            )}
            {!loading && !rows?.length && (
              <tr><td colSpan={columns.length + 1} className="text-muted py-8 text-center">{empty}</td></tr>
            )}
            {rows?.map((row, index) => (
              <tr
                key={rowKey ? rowKey(row) : String((row as { id?: string }).id ?? index)}
                className={cn(onRowClick && 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn(c.numeric && 'num', c.className)}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                  </td>
                ))}
                {actions && <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}

export function Pagination({ page, pages, count, onChange }: { page: number; pages: number; count: number; onChange: (page: number) => void }) {
  if (pages <= 1) return <div className="text-muted px-4 py-2 text-xs">{count} registro(s)</div>
  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs">
      <span className="text-muted">{count} registros · página {page} de {pages}</span>
      <div className="flex gap-1">
        <button className="btn-ghost p-1" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior"><ChevronLeft className="size-4" /></button>
        <button className="btn-ghost p-1" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Siguiente"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  )
}
