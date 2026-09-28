import {
  BarChart3, Building2, CalendarClock, ClipboardCheck, Coins, CreditCard, DollarSign, Droplets, Fuel, History,
  LayoutGrid, Receipt, Ruler, ScrollText, Shield, Tag, Truck, Users, Warehouse, UserCog, Gauge, Scale, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  perm: string
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operación',
    items: [
      { to: '/', label: 'Dashboard', icon: BarChart3, perm: 'reports.view_dashboard' },
      { to: '/jornadas', label: 'Jornadas y cierres', icon: ClipboardCheck, perm: 'operations.view_shift' },
      { to: '/cierres', label: 'Historial de cierres', icon: Receipt, perm: 'closures.view_closure' },
      { to: '/tasas', label: 'Tasa BCV', icon: DollarSign, perm: 'rates.view_exchangerate' },
      { to: '/horarios', label: 'Horarios', icon: CalendarClock, perm: 'scheduling.view_assignment' },
    ],
  },
  {
    section: 'Inventario',
    items: [
      { to: '/inventario/mediciones', label: 'Mediciones de tanque', icon: Gauge, perm: 'inventory.view_tankreading' },
      { to: '/inventario/descargas', label: 'Descargas', icon: Truck, perm: 'inventory.view_delivery' },
      { to: '/inventario/conciliaciones', label: 'Conciliación y merma', icon: Scale, perm: 'inventory.view_reconciliation' },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { to: '/config/estaciones', label: 'Estaciones', icon: Building2, perm: 'catalog.view_station' },
      { to: '/config/islas', label: 'Islas', icon: LayoutGrid, perm: 'catalog.view_island' },
      { to: '/config/surtidores', label: 'Surtidores', icon: Fuel, perm: 'catalog.view_pump' },
      { to: '/config/tanques', label: 'Tanques', icon: Warehouse, perm: 'inventory.view_tank' },
      { to: '/config/aforo', label: 'Aforo de tanques', icon: Ruler, perm: 'inventory.view_tank' },
      { to: '/config/combustibles', label: 'Combustibles', icon: Droplets, perm: 'catalog.view_fueltype' },
      { to: '/config/precios', label: 'Precios', icon: Tag, perm: 'catalog.view_fuelprice' },
      { to: '/config/denominaciones', label: 'Denominaciones', icon: Coins, perm: 'catalog.view_denomination' },
      { to: '/config/terminales', label: 'Puntos y BioPago', icon: CreditCard, perm: 'catalog.view_paymentterminal' },
      { to: '/config/bomberos', label: 'Bomberos', icon: Users, perm: 'catalog.view_attendant' },
      { to: '/config/turnos', label: 'Turnos', icon: History, perm: 'scheduling.view_shifttemplate' },
    ],
  },
  {
    section: 'Seguridad',
    items: [
      { to: '/seguridad/usuarios', label: 'Usuarios', icon: UserCog, perm: 'accounts.view_user' },
      { to: '/seguridad/roles', label: 'Roles y permisos', icon: Shield, perm: 'auth.view_group' },
      { to: '/seguridad/auditoria', label: 'Auditoría', icon: ScrollText, perm: 'audit.view_auditlog' },
    ],
  },
]
