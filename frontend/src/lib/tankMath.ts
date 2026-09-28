/**
 * Tabla de aforo en el cliente: convierte cm en litros para la vista previa mientras se escribe.
 * El servidor (apps/inventory/calibration.py) hace el mismo cálculo y es la fuente de verdad.
 */
import { round3 } from './closureMath'

export interface CalibrationPoint {
  cm: string | number
  liters: string | number
}

const sorted = (points: CalibrationPoint[] | null | undefined) =>
  (points ?? []).map((p) => ({ cm: Number(p.cm), liters: Number(p.liters) })).sort((a, b) => a.cm - b.cm)

/** Rango de alturas cubierto por la tabla, o null si no hay tabla utilizable. */
export function calibrationRange(points: CalibrationPoint[] | null | undefined): [number, number] | null {
  const table = sorted(points)
  return table.length >= 2 ? [table[0].cm, table[table.length - 1].cm] : null
}

/** Litros para una altura, interpolando linealmente. null si no hay tabla o la altura está fuera de rango. */
export function litersAt(points: CalibrationPoint[] | null | undefined, cm: string | number | null | undefined): number | null {
  if (cm === null || cm === undefined || cm === '') return null
  const height = Number(cm)
  const table = sorted(points)
  if (!Number.isFinite(height) || table.length < 2) return null
  if (height < table[0].cm || height > table[table.length - 1].cm) return null
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]
    const b = table[i]
    if (height <= b.cm) return round3(a.liters + ((b.liters - a.liters) * (height - a.cm)) / (b.cm - a.cm))
  }
  return null
}

/** Valida la tabla como lo hace el servidor. Devuelve el primer problema o null. */
export function calibrationError(points: CalibrationPoint[]): string | null {
  if (points.length === 0) return null
  if (points.some((p) => p.cm === '' || p.liters === '' || !Number.isFinite(Number(p.cm)) || !Number.isFinite(Number(p.liters)))) {
    return 'Todos los puntos necesitan centímetros y litros.'
  }
  if (points.some((p) => Number(p.cm) < 0 || Number(p.liters) < 0)) return 'Los valores no pueden ser negativos.'
  if (points.length < 2) return 'La tabla necesita al menos dos puntos.'
  const table = sorted(points)
  for (let i = 1; i < table.length; i++) {
    if (table[i].cm === table[i - 1].cm) return `La altura ${table[i].cm} cm está repetida.`
    if (table[i].liters < table[i - 1].liters) return `Los litros no pueden disminuir al subir de ${table[i - 1].cm} a ${table[i].cm} cm.`
  }
  return null
}

const toNumberText = (token: string) => token.trim().replace(',', '.')

/**
 * Lee una tabla pegada desde una hoja de cálculo o un PDF: una fila por línea con «cm» y «litros»
 * separados por tabulador, punto y coma o espacios (con coma o punto decimal), o «cm,litros».
 */
export function parseCalibrationText(text: string): { points: { cm: string; liters: string }[]; errors: number[] } {
  const points: { cm: string; liters: string }[] = []
  const errors: number[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    let tokens = line.split(/[\t;]+|\s+/).filter(Boolean)
    if (tokens.length === 1 && (line.match(/,/g) ?? []).length === 1) tokens = line.split(',')
    const [cm, liters] = tokens.map(toNumberText)
    if (tokens.length !== 2 || !Number.isFinite(Number(cm)) || !Number.isFinite(Number(liters)) || cm === '' || liters === '') {
      // Encabezados como «cm litros» se ignoran sin marcarlos como error.
      if (index > 0 || /\d/.test(line)) errors.push(index + 1)
      return
    }
    points.push({ cm, liters })
  })
  return { points, errors }
}

/** Altura en cm escrita por tanque (id → texto del input). */
export type TankHeights = Record<string, string>

/** Cada tanque tiene una altura válida dentro de su tabla de aforo. */
export function tankHeightsComplete(rows: { id: string; calibration?: CalibrationPoint[] | null }[], values: TankHeights) {
  return rows.every((row) => litersAt(row.calibration, values[row.id]) !== null)
}

export function toTankReadings(rows: { id: string }[], values: TankHeights) {
  return rows.map((row) => ({ tank: row.id, height_cm: values[row.id] }))
}
