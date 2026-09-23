import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/AuthContext'

const STORAGE_KEY = 'oilowl.station'

interface StationState {
  stationId: string
  setStationId: (id: string) => void
  stations: { id: string; code: string; name: string }[]
}

const StationContext = createContext<StationState | null>(null)

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function StationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const stations = useMemo(() => (user?.stations ?? []) as StationState['stations'], [user])
  const [stationId, setStationIdState] = useState(readStored)

  useEffect(() => {
    if (stations.length && !stations.some((s) => s.id === stationId)) setStationIdState(stations[0].id)
  }, [stations, stationId])

  const setStationId = (id: string) => {
    setStationIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* almacenamiento no disponible */
    }
  }

  return <StationContext.Provider value={{ stationId, setStationId, stations }}>{children}</StationContext.Provider>
}

export function useStation() {
  const ctx = useContext(StationContext)
  if (!ctx) throw new Error('useStation debe usarse dentro de <StationProvider>')
  return ctx
}
