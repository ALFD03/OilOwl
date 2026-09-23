import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Me } from '../api/types'
import { AuthContext, type AuthState } from './AuthContext'
import { Can } from './Can'

function withUser(user: Partial<Me>, ui: React.ReactNode) {
  const value = { user: { is_superuser: false, permissions: [], ...user } as Me, loading: false } as unknown as AuthState
  return render(<AuthContext.Provider value={value}>{ui}</AuthContext.Provider>)
}

describe('<Can>', () => {
  it('muestra el contenido solo con el permiso', () => {
    withUser({ permissions: ['closures.lock_closure'] }, <><Can perm="closures.lock_closure">bloquear</Can><Can perm="accounts.add_user">crear</Can></>)
    expect(screen.getByText('bloquear')).toBeInTheDocument()
    expect(screen.queryByText('crear')).not.toBeInTheDocument()
  })

  it('exige todos los permisos de una lista', () => {
    withUser({ permissions: ['a.x'] }, <Can perm={['a.x', 'a.y']}>ambos</Can>)
    expect(screen.queryByText('ambos')).not.toBeInTheDocument()
  })

  it('el superusuario lo ve todo', () => {
    withUser({ is_superuser: true }, <Can perm="cualquier.cosa">todo</Can>)
    expect(screen.getByText('todo')).toBeInTheDocument()
  })
})
