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

describe('DenominationCounter', () => {
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
