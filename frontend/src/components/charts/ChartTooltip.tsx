/** Tooltip de gráficos con los colores y superficies del tema activo. */
export interface TooltipRow {
  name: string
  value: string
  color?: string
}

export function ChartTooltipBox({ title, rows, footer }: { title?: string; rows: TooltipRow[]; footer?: string }) {
  return (
    <div className="animate-fade-in pointer-events-none min-w-44 rounded-xl border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-2)_94%,transparent)] px-3.5 py-2.5 text-xs shadow-[var(--shadow-lg)] backdrop-blur-md">
      {title && <div className="text-muted mb-1.5 font-medium">{title}</div>}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-4">
            <span className="text-soft flex items-center gap-2">
              {row.color && <span className="size-2.5 rounded-[3px]" style={{ background: row.color }} />}
              {row.name}
            </span>
            <span className="font-semibold text-[var(--text)] tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      {footer && <div className="text-muted border-base mt-2 border-t pt-1.5">{footer}</div>}
    </div>
  )
}
