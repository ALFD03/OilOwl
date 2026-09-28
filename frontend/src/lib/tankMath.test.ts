import { describe, expect, it } from 'vitest'

import { calibrationError, calibrationRange, litersAt, parseCalibrationText } from './tankMath'

// Misma tabla que el tanque de tests/conftest.py::world.
const TABLE = [
  { cm: '0.00', liters: '0.000' },
  { cm: '250.00', liters: '30000.000' },
  { cm: '100.00', liters: '10000.000' },
]

describe('tankMath', () => {
  it('interpola los litros como el servidor', () => {
    expect(litersAt(TABLE, 50)).toBe(5000)
    expect(litersAt(TABLE, '102.25')).toBe(10300)
    expect(litersAt(TABLE, '100.5')).toBe(10066.667)
    expect(litersAt(TABLE, 250)).toBe(30000)
  })

  it('no estima fuera de la tabla ni sin tabla', () => {
    expect(litersAt(TABLE, 251)).toBeNull()
    expect(litersAt(TABLE, '')).toBeNull()
    expect(litersAt([], 10)).toBeNull()
    expect(calibrationRange(TABLE)).toEqual([0, 250])
    expect(calibrationRange([{ cm: 1, liters: 1 }])).toBeNull()
  })

  it('valida la tabla', () => {
    expect(calibrationError(TABLE)).toBeNull()
    expect(calibrationError([{ cm: 0, liters: 0 }])).toMatch(/dos puntos/)
    expect(calibrationError([{ cm: 0, liters: 10 }, { cm: 5, liters: 5 }])).toMatch(/disminuir/)
    expect(calibrationError([{ cm: 5, liters: 1 }, { cm: 5, liters: 2 }])).toMatch(/repetida/)
  })

  it('lee tablas pegadas en varios formatos', () => {
    const { points, errors } = parseCalibrationText('cm\tlitros\n0\t0\n10,5;1050,25\n20 2100\n30,3000\nx y\n')
    expect(points).toEqual([
      { cm: '0', liters: '0' },
      { cm: '10.5', liters: '1050.25' },
      { cm: '20', liters: '2100' },
      { cm: '30', liters: '3000' },
    ])
    expect(errors).toEqual([6])
  })
})
