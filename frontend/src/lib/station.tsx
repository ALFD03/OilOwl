import { useMemo, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/AuthContext'
import { StationContext, type StationState } from './stationContext'

const STORAGE_KEY = 'oilowl.station'

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
  const [selected, setSelected] = useState(readStored)
  // Si la estación guardada ya no está disponible se usa la primera asignada.
  const stationId = stations.some((s) => s.id === selected) ? selected : (stations[0]?.id ?? '')

  const setStationId = (id: string) => {
    setSelected(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* almacenamiento no disponible */
    }
  }

  return <StationContext.Provider value={{ stationId, setStationId, stations }}>{children}</StationContext.Provider>
}
