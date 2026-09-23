const LOCALE = 'es-VE'

const toNumber = (value: unknown) => (value === null || value === undefined || value === '' ? 0 : Number(value))

const moneyFormatters = {
  USD: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  VES: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}
const litersFormatter = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const rateFormatter = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export const CURRENCY_SYMBOL = { USD: '$', VES: 'Bs' } as const

export function money(value: unknown, currency: 'USD' | 'VES' = 'USD') {
  return `${CURRENCY_SYMBOL[currency]} ${moneyFormatters[currency].format(toNumber(value))}`
}

export function signedMoney(value: unknown, currency: 'USD' | 'VES' = 'USD') {
  const n = toNumber(value)
  return `${n > 0 ? '+' : ''}${money(n, currency)}`
}

export function liters(value: unknown) {
  return `${litersFormatter.format(toNumber(value))} L`
}

export function signedLiters(value: unknown) {
  const n = toNumber(value)
  return `${n > 0 ? '+' : ''}${liters(n)}`
}

export function rate(value: unknown) {
  return rateFormatter.format(toNumber(value))
}

export function date(value: string | null | undefined) {
  if (!value) return '—'
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function dateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' })
}

export function today() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function daysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** Fecha y hora local para inputs datetime-local. */
export function nowLocal() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export { toNumber }
