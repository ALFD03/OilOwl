/**
 * Vista previa en el cliente de los cálculos del cierre. El servidor recalcula todo al guardar;
 * estos valores solo sirven para que el operador vea el cuadre mientras escribe.
 */
export type Currency = 'USD' | 'VES'

export interface ReadingInput {
  initial: string | number
  final: string | number | null | undefined
  price: string | number
  price_currency: Currency
  meter_max?: string | number | null
}

export interface LineInput {
  amount: string | number
  currency: Currency
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor
}
export const round2 = (v: number) => round(v, 2)
export const round3 = (v: number) => round(v, 3)

export function readingLiters(r: ReadingInput): number | null {
  if (r.final === null || r.final === undefined || r.final === '') return null
  const initial = Number(r.initial)
  const final = Number(r.final)
  if (Number.isNaN(initial) || Number.isNaN(final)) return null
  if (final >= initial) return round3(final - initial)
  if (r.meter_max) return round3(Number(r.meter_max) - initial + final)
  return null // lectura inválida: el servidor la rechazará
}

export function readingAmounts(r: ReadingInput, rate: number) {
  const liters = readingLiters(r) ?? 0
  const gross = liters * Number(r.price)
  if (r.price_currency === 'USD') {
    const usd = round2(gross)
    return { liters, usd, ves: round2(usd * rate) }
  }
  const ves = round2(gross)
  return { liters, usd: rate ? round2(ves / rate) : 0, ves }
}

export function toUsd(amount: number, currency: Currency, rate: number) {
  return currency === 'USD' ? round2(amount) : rate ? round2(amount / rate) : 0
}

export function toVes(amount: number, currency: Currency, rate: number) {
  return currency === 'VES' ? round2(amount) : round2(amount * rate)
}

export function summarize(readings: ReadingInput[], lines: LineInput[], rate: number) {
  const expected = readings.map((r) => readingAmounts(r, rate))
  const expectedLiters = round3(expected.reduce((s, e) => s + e.liters, 0))
  const expectedUsd = round2(expected.reduce((s, e) => s + e.usd, 0))
  const expectedVes = round2(expected.reduce((s, e) => s + e.ves, 0))
  const declaredUsd = round2(lines.reduce((s, l) => s + toUsd(Number(l.amount) || 0, l.currency, rate), 0))
  const declaredVes = round2(lines.reduce((s, l) => s + toVes(Number(l.amount) || 0, l.currency, rate), 0))
  const diffUsd = round2(declaredUsd - expectedUsd)
  const avgPrice = expectedLiters ? expectedUsd / expectedLiters : 0
  return {
    expectedLiters, expectedUsd, expectedVes, declaredUsd, declaredVes, diffUsd,
    diffVes: round2(declaredVes - expectedVes),
    diffLiters: avgPrice ? round3(diffUsd / avgPrice) : 0,
    result: diffUsd > 0 ? 'OVER' : diffUsd < 0 ? 'SHORT' : 'EXACT',
  } as const
}
