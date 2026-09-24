import { Building2, KeyRound, LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { hasPerms, useAuth } from '../auth/AuthContext'
import { cn } from '../lib/cn'
import { useStation } from '../lib/stationContext'
import { NAV } from './nav'

/** Tema oscuro "Night & Gold" por defecto; el claro es opcional y se recuerda. */
function useTheme() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? 'dark')
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('oilowl.theme', next)
    } catch {
      /* sin almacenamiento */
    }
  }
  return { dark: theme !== 'light', toggle }
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/brand/isotipo.webp" alt="" className="size-9 drop-shadow-[0_4px_12px_rgba(197,160,89,0.35)]" />
      {!compact && (
        <span className="leading-none">
          <span className="font-display gold-gradient-text block text-[1.6rem] font-semibold">OilOwl</span>
          <span className="text-muted mt-1 block text-[9px] font-medium tracking-[0.16em] uppercase">Gestión de energía</span>
        </span>
      )}
    </span>
  )
}

function StationSwitcher() {
  const { stationId, setStationId, stations } = useStation()
  if (!stations.length) return <span className="text-muted text-sm">Sin estaciones asignadas</span>
  return (
    <div className="relative">
      <Building2 className="text-gold pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <select className="input max-w-72 py-2 pl-9" value={stationId} onChange={(e) => setStationId(e.target.value)} aria-label="Estación activa">
        {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const theme = useTheme()
  const location = useLocation()
  const initials = (user?.first_name?.[0] ?? user?.username?.[0] ?? '?').toUpperCase() + (user?.last_name?.[0] ?? '').toUpperCase()

  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => hasPerms(user, i.perm)) })).filter((s) => s.items.length)

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <Link to="/" className="px-2" onClick={() => setOpen(false)}>
        <Brand />
      </Link>
      <div className="gold-divider mx-2" />
      {sections.map((section) => (
        <div key={section.section}>
          <div className="text-muted mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] uppercase">{section.section}</div>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200',
                    isActive
                      ? 'bg-brand-500/[0.12] font-medium text-gold shadow-[inset_0_0_0_1px_rgb(197_160_89/0.18)]'
                      : 'text-soft hover:translate-x-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500 transition-all duration-300',
                        isActive ? 'opacity-100 shadow-[0_0_12px_rgb(197_160_89/0.8)]' : 'opacity-0',
                      )}
                    />
                    <item.icon className={cn('size-4 shrink-0 transition-colors', isActive ? 'text-gold' : 'text-muted group-hover:text-gold')} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="glass border-base sticky top-0 hidden h-screen w-64 shrink-0 border-r lg:block">{sidebar}</aside>
      {open && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-[#050a14]/70 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <aside className="bg-surface border-base animate-scale-in relative h-full w-72 border-r shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost absolute top-4 right-3 p-2" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="glass border-base sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu className="size-5" /></button>
          <span className="lg:hidden"><Brand compact /></span>
          <StationSwitcher />
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost p-2" onClick={theme.toggle} aria-label="Cambiar tema" title={theme.dark ? 'Tema claro' : 'Tema oscuro'}>
              {theme.dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link to="/cambiar-clave" className="btn-ghost p-2" title="Cambiar contraseña"><KeyRound className="size-4" /></Link>
            <button className="btn-ghost p-2" onClick={logout} title="Salir"><LogOut className="size-4" /></button>
            <div className="border-base ml-2 flex items-center gap-2.5 border-l pl-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-700 text-xs font-semibold text-[#050a14] shadow-[var(--glow)]">
                {initials}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-medium">{user?.first_name || user?.username}</span>
                <span className="text-muted block text-[11px]">{user?.is_superuser ? 'Superusuario' : (user?.roles?.[0] ?? 'Usuario')}</span>
              </span>
            </div>
          </div>
        </header>
        <main key={location.pathname} className="animate-fade-up mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
