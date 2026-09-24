import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { Spinner } from '../components/ui/Spinner'
import { useAuth, usePermission } from './AuthContext'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner full />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.must_change_password && location.pathname !== '/cambiar-clave') return <Navigate to="/cambiar-clave" replace />
  return <Outlet />
}

export function RequirePerm({ perm }: { perm: string | string[] }) {
  const allowed = usePermission(perm)
  if (!allowed) {
    return (
      <div className="card animate-fade-up p-12 text-center">
        <img src="/brand/isotipo.webp" alt="" className="mx-auto mb-4 size-14 opacity-80" />
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="text-muted mt-1 text-sm">No tiene permiso para ver esta sección. Solicítelo a un administrador.</p>
      </div>
    )
  }
  return <Outlet />
}
