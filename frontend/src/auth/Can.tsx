import type { ReactNode } from 'react'

import { usePermission } from './AuthContext'

/** Renderiza su contenido solo si el usuario tiene los permisos indicados. */
export function Can({ perm, children, fallback = null }: { perm?: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  return usePermission(perm) ? <>{children}</> : <>{fallback}</>
}
