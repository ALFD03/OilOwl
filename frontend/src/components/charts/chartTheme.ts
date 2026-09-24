/**
 * Colores de los gráficos leídos de los tokens CSS del tema activo.
 * Recharts pinta SVG con atributos, así que se resuelven los valores reales y se
 * vuelven a leer cuando cambia el tema (data-theme en <html>).
 */
import { useEffect, useState } from 'react'

const TOKENS = [
  'series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'diverge-neg', 'diverge-pos',
  'chart-grid', 'chart-axis', 'chart-cursor', 'muted', 'text', 'surface',
] as const

export type ChartTheme = Record<(typeof TOKENS)[number], string> & { series: string[] }

function read(): ChartTheme {
  const style = getComputedStyle(document.documentElement)
  const values = Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim()])) as unknown as ChartTheme
  values.series = [values['series-1'], values['series-2'], values['series-3'], values['series-4'], values['series-5']]
  return values
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

/** Color fijo por entidad (nunca por posición en el filtro): índice estable en una lista ordenada. */
export function colorFor(key: string, keys: string[], theme: ChartTheme) {
  const index = [...keys].sort().indexOf(key)
  return theme.series[index % theme.series.length]
}
