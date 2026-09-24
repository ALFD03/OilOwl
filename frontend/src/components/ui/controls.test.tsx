import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { ChoiceChips } from './ChoiceChips'
import { MultiSelect } from './MultiSelect'
import { Switch } from './Switch'

function Chips() {
  const [value, setValue] = useState<string[]>([])
  return <ChoiceChips choices={[{ value: 'a', label: 'Uno' }, { value: 'b', label: 'Dos' }, { value: 'c', label: 'Tres', disabled: true }]} value={value} onChange={setValue} />
}

function Roles() {
  const [value, setValue] = useState<string[]>([])
  return <MultiSelect options={[{ value: '1', label: 'Supervisor' }, { value: '2', label: 'Cajero' }]} value={value} onChange={setValue} />
}

describe('controles de selección', () => {
  it('Switch alterna su estado accesible', () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch label="Activo" checked={on} onChange={setOn} />
    }
    render(<Harness />)
    const sw = screen.getByRole('switch', { name: /Activo/ })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('ChoiceChips: seleccionar todo omite las opciones deshabilitadas y quitar todo limpia', () => {
    render(<Chips />)
    fireEvent.click(screen.getByText('Seleccionar todo'))
    expect(screen.getByRole('checkbox', { name: 'Uno' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Tres' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('2 de 3 seleccionados')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Quitar todo'))
    expect(screen.getByRole('checkbox', { name: 'Dos' })).toHaveAttribute('aria-checked', 'false')
  })

  it('MultiSelect: despliega, filtra y muestra lo elegido como etiquetas', () => {
    render(<Roles />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'caj' } })
    expect(screen.queryByRole('option', { name: /Supervisor/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Cajero/ }))
    expect(screen.getByLabelText('Quitar Cajero')).toBeInTheDocument()
  })
})
