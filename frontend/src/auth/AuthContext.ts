import { createContext, useContext } from 'react'

import type { Me } from '../api/types'

export interface AuthState {
  user: Me | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reload: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** true si el usuario tiene TODOS los permisos indicados. */
export function hasPerms(user: Me | null, perms: string | string[] | undefined) {
  if (!perms) return true
  if (!user) return false
  if (user.is_superuser) return true
  const owned = new Set(user.permissions)
  return (Array.isArray(perms) ? perms : [perms]).every((p) => owned.has(p))
}

export function usePermission(perms: string | string[] | undefined) {
  return hasPerms(useAuth().user, perms)
}
