import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { Denomination } from '../../api/types'
import { DenominationCounter } from './DenominationCounter'

const denoms = [
  { id: 'd20', currency: 'USD', value: '20.00', kind: 'BILL' },
  { id: 'd1', currency: 'USD', value: '1.00', kind: 'BILL' },
] as Denomination[]

function Harness() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  return <DenominationCounter title="Efectivo $" denominations={denoms} counts={counts} onChange={setCounts} />
}

const ves = [{ id: 'b100', currency: 'VES', value: '100.00', kind: 'BILL' }] as Denomination[]

describe('DenominationCounter', () => {
  it('muestra el equivalente en dólares de los bolívares a la tasa de la jornada', () => {
    render(<DenominationCounter title="Efectivo Bs" denominations={ves} counts={{ b100: 17 }} onChange={() => undefined} rate={850} />)
    expect(screen.getByTestId('denomination-total')).toHaveTextContent('Bs 1.700,00')
    expect(screen.getByTestId('denomination-usd')).toHaveTextContent('≈ $ 2,00 al cambio')
  })

  it('multiplica cantidad por denominación y totaliza', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Cantidad de 20.00 USD'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Cantidad de 1.00 USD'), { target: { value: '5' } })
    expect(screen.getByTestId('denomination-total')).toHaveTextContent('$ 45,00')
  })

  it('ignora cantidades negativas o decimales', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Cantidad de 20.00 USD'), { target: { value: '-3' } })
    expect(screen.getByTestId('denomination-total')).toHaveTextContent('$ 0,00')
  })
})
