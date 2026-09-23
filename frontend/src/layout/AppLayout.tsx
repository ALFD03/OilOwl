import { KeyRound, LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { hasPerms, useAuth } from '../auth/AuthContext'
import { cn } from '../lib/cn'
import { useStation } from '../lib/station'
import { NAV } from './nav'

function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('oilowl.theme') ?? ''
    } catch {
      return ''
    }
  })
  const apply = (value: string) => {
    setTheme(value)
    if (value) document.documentElement.dataset.theme = value
    else delete document.documentElement.dataset.theme
    try {
      localStorage.setItem('oilowl.theme', value)
    } catch {
      /* sin almacenamiento */
    }
  }
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  return { dark, toggle: () => apply(dark ? 'light' : 'dark') }
}

function StationSwitcher() {
  const { stationId, setStationId, stations } = useStation()
  if (!stations.length) return <span className="text-muted text-sm">Sin estaciones asignadas</span>
  return (
    <select className="input max-w-64 py-1.5" value={stationId} onChange={(e) => setStationId(e.target.value)} aria-label="Estación activa">
      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const theme = useTheme()

  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => hasPerms(user, i.perm)) })).filter((s) => s.items.length)

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <Link to="/" className="flex items-center gap-2 px-2 text-lg font-semibold" onClick={() => setOpen(false)}>
        <img src="/favicon.svg" alt="" className="size-7" /> OilOwl
      </Link>
      {sections.map((section) => (
        <div key={section.section}>
          <div className="text-muted mb-1 px-2 text-[11px] font-semibold tracking-wider uppercase">{section.section}</div>
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', isActive ? 'bg-brand-500/15 text-brand-700 font-medium dark:text-brand-100' : 'hover:bg-black/5 dark:hover:bg-white/5')
              }
            >
              <item.icon className="size-4" /> {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="bg-surface border-base sticky top-0 hidden h-screen w-60 shrink-0 border-r lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="bg-surface h-full w-64" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost absolute top-3 left-52 p-1" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="bg-surface border-base sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2.5">
          <button className="btn-ghost p-1 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu className="size-5" /></button>
          <StationSwitcher />
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost p-2" onClick={theme.toggle} aria-label="Cambiar tema">{theme.dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
            <span className="text-muted hidden px-2 text-sm sm:inline">{user?.first_name || user?.username}</span>
            <Link to="/cambiar-clave" className="btn-ghost p-2" title="Cambiar contraseña"><KeyRound className="size-4" /></Link>
            <button className="btn-ghost p-2" onClick={logout} title="Salir"><LogOut className="size-4" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
