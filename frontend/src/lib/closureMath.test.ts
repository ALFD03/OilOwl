import { describe, expect, it } from 'vitest'

import { readingLiters, summarize } from './closureMath'

describe('closureMath', () => {
  it('calcula litros con reinicio del totalizador', () => {
    expect(readingLiters({ initial: 999990, final: 10, price: 0.5, price_currency: 'USD', meter_max: '999999.999' })).toBe(19.999)
    expect(readingLiters({ initial: 100, final: 50, price: 0.5, price_currency: 'USD' })).toBeNull()
    expect(readingLiters({ initial: 100, final: '', price: 0.5, price_currency: 'USD' })).toBeNull()
  })

  it('coincide con el cálculo del servidor para un cierre con faltante', () => {
    // Mismo escenario que tests/test_closures.py::test_full_closure_flow_computes_differences
    const readings = [
      { initial: 1000, final: 1100, price: '0.5000', price_currency: 'USD' as const },
      { initial: 2000, final: 2050, price: '0.5000', price_currency: 'USD' as const },
    ]
    const lines = [
      { amount: 45, currency: 'USD' as const },
      { amount: 1000, currency: 'VES' as const },
      { amount: 1500, currency: 'VES' as const },
      { amount: 400, currency: 'VES' as const },
    ]
    const s = summarize(readings, lines, 100)
    expect(s).toMatchObject({
      expectedLiters: 150, expectedUsd: 75, expectedVes: 7500, declaredUsd: 74, declaredVes: 7400,
      diffUsd: -1, diffVes: -100, diffLiters: -2, result: 'SHORT',
    })
  })
})
