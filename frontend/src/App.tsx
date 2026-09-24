import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { hasPerms, useAuth } from './auth/AuthContext'
import { RequireAuth, RequirePerm } from './auth/guards'
import { ChangePasswordPage } from './features/auth/ChangePasswordPage'
import { LoginPage } from './features/auth/LoginPage'
import { AuditPage } from './features/audit/AuditPage'
import * as catalog from './features/catalog/pages'
import { ClosurePage } from './features/closures/ClosurePage'
import { ClosuresHistoryPage } from './features/closures/ClosuresHistoryPage'
import * as inventory from './features/inventory/pages'
import { ShiftDetailPage } from './features/operations/ShiftDetailPage'
import { ShiftsPage } from './features/operations/ShiftsPage'
import { RatesPage } from './features/rates/RatesPage'
import { SchedulePage } from './features/scheduling/SchedulePage'
import { RolesPage } from './features/users/RolesPage'
import { UsersPage } from './features/users/UsersPage'
import { AppLayout } from './layout/AppLayout'
import { NAV } from './layout/nav'
import { Spinner } from './components/ui/Spinner'
import { StationProvider } from './lib/station'

// Recharts es pesado: el dashboard se carga bajo demanda.
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))

/** Rutas protegidas por permiso: [ruta, permiso, página]. */
const ROUTES: [string, string, React.ComponentType][] = [
  ['jornadas', 'operations.view_shift', ShiftsPage],
  ['jornadas/:id', 'operations.view_shift', ShiftDetailPage],
  ['cierres', 'closures.view_closure', ClosuresHistoryPage],
  ['cierres/:id', 'closures.view_closure', ClosurePage],
  ['tasas', 'rates.view_exchangerate', RatesPage],
  ['horarios', 'scheduling.view_assignment', SchedulePage],
  ['inventario/mediciones', 'inventory.view_tankreading', inventory.TankReadingsPage],
  ['inventario/descargas', 'inventory.view_delivery', inventory.DeliveriesPage],
  ['inventario/conciliaciones', 'inventory.view_reconciliation', inventory.ReconciliationsPage],
  ['config/estaciones', 'catalog.view_station', catalog.StationsPage],
  ['config/islas', 'catalog.view_island', catalog.IslandsPage],
  ['config/surtidores', 'catalog.view_pump', catalog.PumpsPage],
  ['config/tanques', 'inventory.view_tank', catalog.TanksPage],
  ['config/combustibles', 'catalog.view_fueltype', catalog.FuelTypesPage],
  ['config/precios', 'catalog.view_fuelprice', catalog.FuelPricesPage],
  ['config/denominaciones', 'catalog.view_denomination', catalog.DenominationsPage],
  ['config/terminales', 'catalog.view_paymentterminal', catalog.TerminalsPage],
  ['config/bomberos', 'catalog.view_attendant', catalog.AttendantsPage],
  ['config/turnos', 'scheduling.view_shifttemplate', catalog.ShiftTemplatesPage],
  ['seguridad/usuarios', 'accounts.view_user', UsersPage],
  ['seguridad/roles', 'auth.view_group', RolesPage],
  ['seguridad/auditoria', 'audit.view_auditlog', AuditPage],
]

function Home() {
  const { user } = useAuth()
  if (hasPerms(user, 'reports.view_dashboard')) return <Suspense fallback={<Spinner full />}><DashboardPage /></Suspense>
  const first = NAV.flatMap((s) => s.items).find((i) => i.to !== '/' && hasPerms(user, i.perm))
  if (first) return <Navigate to={first.to} replace />
  return (
    <div className="card animate-fade-up p-12 text-center">
        <img src="/brand/isotipo.webp" alt="" className="mx-auto mb-4 size-14 opacity-80" />
      <h2 className="text-lg font-semibold">Bienvenido a OilOwl</h2>
      <p className="text-muted mt-1 text-sm">Su usuario aún no tiene permisos asignados. Contacte a un administrador.</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<StationProvider><AppLayout /></StationProvider>}>
          <Route index element={<Home />} />
          <Route path="cambiar-clave" element={<ChangePasswordPage />} />
          {ROUTES.map(([path, perm, Page]) => (
            <Route key={path} element={<RequirePerm perm={perm} />}>
              <Route path={path} element={<Page />} />
            </Route>
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
