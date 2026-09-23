import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, refreshSession, tokenStore } from '../api/client'
import type { Me } from '../api/types'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  const reload = useCallback(async () => {
    setUser(await api<Me>('auth/me'))
  }, [])

  useEffect(() => {
    // Restaura la sesión desde la cookie de refresh al cargar la app.
    refreshSession()
      .then((token) => (token ? reload() : undefined))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    return tokenStore.subscribe((token) => {
      if (!token) setUser(null)
    })
  }, [reload])

  const login = useCallback(async (username: string, password: string) => {
    const data = await api<{ access: string; user: Me }>('auth/login', { method: 'POST', body: { username, password } })
    tokenStore.set(data.access)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    await api('auth/logout', { method: 'POST' }).catch(() => undefined)
    tokenStore.set(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(() => ({ user, loading, login, logout, reload }), [user, loading, login, logout, reload])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
