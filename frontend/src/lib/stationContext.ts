import { createContext, useContext } from 'react'

export interface StationState {
  stationId: string
  setStationId: (id: string) => void
  stations: { id: string; code: string; name: string }[]
}

export const StationContext = createContext<StationState | null>(null)

export function useStation() {
  const ctx = useContext(StationContext)
  if (!ctx) throw new Error('useStation debe usarse dentro de <StationProvider>')
  return ctx
}
