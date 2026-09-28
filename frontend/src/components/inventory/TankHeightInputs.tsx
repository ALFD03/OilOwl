/**
 * Medición de tanques en cm al abrir o cerrar la jornada. Los litros se calculan con la tabla
 * de aforo de cada tanque; al cerrar, además se previsualiza la merma contra lo esperado.
 */
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '../../lib/cn'
import { liters, signedLiters } from '../../lib/format'
import { calibrationRange, litersAt, type CalibrationPoint, type TankHeights } from '../../lib/tankMath'
import { Badge } from '../ui/Badge'

export interface TankHeightRow {
  id: string
  code: string
  name: string
  fuel?: string
  calibration?: CalibrationPoint[] | null
  /** Litros esperados (apertura + recepciones − vendido); activa la vista previa de la merma. */
  expected?: number | null
  tolerancePct?: number
  /** Litros vendidos en la jornada: base del porcentaje de merma, como en el servidor. */
  sold?: number | null
}

export function TankHeightInputs({ rows, values, onChange }: { rows: TankHeightRow[]; values: TankHeights; onChange: (values: TankHeights) => void }) {
  const withVariance = rows.some((r) => r.expected !== undefined)
  if (rows.length === 0) return <p className="text-muted text-sm">La estación no tiene tanques activos.</p>
  return (
    <div className="border-base overflow-x-auto rounded-xl border">
      <table className="table-base">
        <thead>
          <tr>
            <th>Tanque</th>
            {withVariance && <th className="num">Esperado</th>}
            <th className="num">Medición (cm)</th>
            <th className="num">Litros</th>
            {withVariance && <th className="num">Diferencia</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const range = calibrationRange(row.calibration)
            const value = values[row.id] ?? ''
            const lit = litersAt(row.calibration, value)
            const invalid = value !== '' && lit === null
            const variance = lit !== null && row.expected !== null && row.expected !== undefined ? lit - row.expected : null
            const base = row.sold ? row.sold : row.expected
            const pct = variance !== null && base ? (variance / base) * 100 : null
            return (
              <tr key={row.id}>
                <td>
                  <div className="font-medium">{row.code} · {row.name}</div>
                  {row.fuel && <div className="text-muted text-xs">{row.fuel}</div>}
                  {!range && (
                    <Link to="/config/aforo" className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning underline">
                      <AlertTriangle className="size-3" /> Sin tabla de aforo: configúrela
                    </Link>
                  )}
                </td>
                {withVariance && <td className="num">{row.expected === null || row.expected === undefined ? '—' : liters(row.expected)}</td>}
                <td className="num">
                  <input
                    className={cn('input w-28 py-1 text-right tabular-nums', invalid && 'border-negative')}
                    type="number" step="0.01" min={range?.[0] ?? 0} max={range?.[1]} disabled={!range}
                    aria-label={`Medición en cm ${row.code}`}
                    placeholder={range ? `${range[0]}–${range[1]}` : ''}
                    value={value}
                    onChange={(e) => onChange({ ...values, [row.id]: e.target.value })}
                  />
                </td>
                <td className="num">{lit === null ? (invalid ? <span className="text-negative text-xs">Fuera de la tabla</span> : '—') : liters(lit)}</td>
                {withVariance && (
                  <td className="num">
                    {variance === null ? '—' : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={variance < 0 ? 'text-negative' : ''}>{signedLiters(variance)}{pct !== null && ` (${pct.toFixed(2)} %)`}</span>
                        {pct !== null && row.tolerancePct !== undefined && (
                          Math.abs(pct) <= row.tolerancePct ? <Badge tone="green">Dentro de tolerancia</Badge> : <Badge tone="red">Fuera de tolerancia</Badge>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
