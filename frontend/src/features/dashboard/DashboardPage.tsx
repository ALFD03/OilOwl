import { useQuery } from '@tanstack/react-query'
import { DollarSign, Droplets, Fuel, Scale } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from '../../api/client'
import { colorFor, useChartTheme } from '../../components/charts/chartTheme'
import { ChartTooltipBox } from '../../components/charts/ChartTooltip'
import { usePermission } from '../../auth/AuthContext'
import { ErrorAlert } from '../../components/ui/Alert'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { date, daysAgo, liters, money, signedLiters, signedMoney, today } from '../../lib/format'
import { useStation } from '../../lib/stationContext'

type Params = { station: string; from: string; to: string }
const METHOD_LABEL: Record<string, string> = { CASH_VES: 'Efectivo Bs', CASH_USD: 'Efectivo $', POS: 'Punto de venta', BIOPAGO: 'BioPago' }

/** Paso "redondo" (1, 2, 5 × 10^n) para ejes legibles. */
function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power
}

/** 2026-09-24 → 24/09 */
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function useReport<T>(name: string, params: Params, enabled = true) {
  return useQuery({ queryKey: ['reports', name, params], queryFn: () => api<T>(`reports/${name}`, { query: params }), enabled: enabled && !!params.station })
}

function ChartCard({ title, subtitle, legend, empty, children }: { title: string; subtitle?: string; legend?: React.ReactNode; empty?: boolean; children: React.ReactNode }) {
  return (
    <div className="card card-interactive animate-fade-up p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}
        </div>
        {!empty && legend}
      </div>
      <div className="h-64">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <img src="/brand/isotipo.webp" alt="" className="size-12 opacity-25 grayscale" />
            <span className="text-muted text-sm">Sin cierres bloqueados en el rango seleccionado</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/** Leyenda en HTML (siempre presente con 2+ series): la identidad nunca depende solo del color. */
function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <span key={item.name} className="text-soft inline-flex items-center gap-1.5 text-xs">
          <span className="size-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.name}
        </span>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { stationId } = useStation()
  const [range, setRange] = useState({ from: daysAgo(29), to: today() })
  const params = { station: stationId, ...range }
  const canSales = usePermission('reports.view_sales_report')
  const canDiff = usePermission('reports.view_differences_report')
  const canInventory = usePermission('reports.view_inventory_report')

  const summary = useReport<Record<string, string | number>>('summary', params)
  const sales = useReport<{ date: string; liters: string; usd: string; ves: string; diff_usd: string }[]>('sales-by-day', params, canSales)
  const fuels = useReport<{ date: string; fuel: string; color: string; liters: string }[]>('liters-by-fuel', params, canSales)
  const methods = useReport<{ method: string; amount_usd: string }[]>('payment-methods', params, canSales)
  const diffs = useReport<{ by_attendant: { attendant__name: string | null; diff_usd: string; closures: number; short: number; over: number }[] }>('differences', params, canDiff)
  const shrink = useReport<{ tank__name: string; variance_liters: string; variance_usd: string; out_of_tolerance: number }[]>('shrinkage', params, canInventory)

  const theme = useChartTheme()
  const axis = { fontSize: 11, fill: theme.muted }
  const axisLine = { stroke: theme['chart-axis'] }

  const fuelNames = [...new Set(fuels.data?.map((f) => f.fuel) ?? [])].sort()
  const fuelColor = (fuel: string) => colorFor(fuel, fuelNames, theme)
  const fuelRows = Object.values(
    (fuels.data ?? []).reduce<Record<string, Record<string, number | string>>>((acc, f) => {
      acc[f.date] ??= { date: f.date }
      acc[f.date][f.fuel] = Number(f.liters)
      return acc
    }, {}),
  )
  const salesRows = (sales.data ?? []).map((d) => ({ date: d.date, usd: Number(d.usd), ves: Number(d.ves), liters: Number(d.liters), diff: Number(d.diff_usd) }))
  const methodTotal = (methods.data ?? []).reduce((sum, m) => sum + Number(m.amount_usd), 0)
  const methodRows = (methods.data ?? [])
    .map((m) => ({ name: METHOD_LABEL[m.method] ?? m.method, usd: Number(m.amount_usd), ves: Number((m as { amount_ves?: string }).amount_ves ?? 0) }))
    .sort((a, b) => b.usd - a.usd)
  // Eje simétrico y con valores redondos; incluye siempre el 0 y deja aire para las etiquetas.
  const diffValues = (diffs.data?.by_attendant ?? []).map((d) => Number(d.diff_usd))
  const diffStep = niceStep(Math.max(1, ...diffValues.map(Math.abs)) * 1.3 / 4)
  const diffDomain: [number, number] = [
    Math.min(0, ...diffValues) < 0 ? -diffStep * 4 : 0,
    Math.max(0, ...diffValues) > 0 ? diffStep * 4 : 0,
  ]
  const diffTicks = Array.from({ length: Math.round((diffDomain[1] - diffDomain[0]) / diffStep) + 1 }, (_, i) => diffDomain[0] + i * diffStep)
  const diffRows = (diffs.data?.by_attendant ?? []).map((d) => ({
    name: d.attendant__name ?? 'Sin asignar', diff: Number(d.diff_usd), closures: d.closures, short: d.short, over: d.over,
  }))

  const s = summary.data ?? {}

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Cifras de cierres bloqueados (definitivos)."
        actions={
          <div className="flex gap-2">
            <input className="input w-40" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="Desde" />
            <input className="input w-40" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="Hasta" />
          </div>
        }
      />
      <ErrorAlert error={summary.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={DollarSign} label="Ventas" value={money(s.sales_usd)} sub={money(s.sales_ves, 'VES')} />
        <StatCard icon={Fuel} label="Litros despachados" value={liters(s.liters)} sub={`${s.closures ?? 0} cierres`} />
        <StatCard icon={Scale} label="Sobrante / faltante" value={signedMoney(s.diff_usd)} sub={`${signedLiters(s.diff_liters)} · ${s.short ?? 0} faltantes`} tone={Number(s.diff_usd) < 0 ? 'bad' : undefined} />
        <StatCard icon={Droplets} label="Merma de tanques" value={signedLiters(s.shrinkage_liters)} sub={`${signedMoney(s.shrinkage_usd)} · ${s.reconciliations_out_of_tolerance ?? 0} fuera de tolerancia`} tone={Number(s.shrinkage_liters) < 0 ? 'bad' : undefined} />
      </div>

      {canSales && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Ventas por día" subtitle="En dólares, según las lecturas de los surtidores" empty={!salesRows.length}>
            <ResponsiveContainer>
              <AreaChart data={salesRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme['series-1']} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={theme['series-1']} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={theme['chart-grid']} vertical={false} />
                <XAxis dataKey="date" tick={axis} tickFormatter={shortDate} axisLine={axisLine} tickLine={false} minTickGap={16} />
                <YAxis tick={axis} tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  cursor={{ stroke: theme['chart-axis'], strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const row = active && payload?.[0]?.payload as (typeof salesRows)[number] | undefined
                    if (!row) return null
                    return (
                      <ChartTooltipBox
                        title={date(row.date)}
                        rows={[
                          { name: 'Ventas', value: money(row.usd), color: theme['series-1'] },
                          { name: 'En bolívares', value: money(row.ves, 'VES') },
                          { name: 'Litros', value: liters(row.liters) },
                        ]}
                        footer={`Sobrante / faltante: ${signedMoney(row.diff)}`}
                      />
                    )
                  }}
                />
                <Area type="monotone" dataKey="usd" name="Ventas" stroke={theme['series-1']} strokeWidth={2} fill="url(#salesFill)" dot={false}
                  activeDot={{ r: 5, fill: theme['series-1'], stroke: theme.surface, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Litros por día y combustible"
            empty={!fuelRows.length}
            legend={<Legend items={fuelNames.map((f) => ({ name: f, color: fuelColor(f) }))} />}
          >
            <ResponsiveContainer>
              <BarChart data={fuelRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke={theme['chart-grid']} vertical={false} />
                <XAxis dataKey="date" tick={axis} tickFormatter={shortDate} axisLine={axisLine} tickLine={false} minTickGap={16} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  cursor={{ fill: theme['chart-cursor'] }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const total = payload.reduce((sum, p) => sum + Number(p.value ?? 0), 0)
                    return (
                      <ChartTooltipBox
                        title={date(String(label))}
                        rows={[...payload].reverse().map((p) => ({ name: String(p.name), value: liters(p.value), color: fuelColor(String(p.name)) }))}
                        footer={`Total: ${liters(total)}`}
                      />
                    )
                  }}
                />
                {fuelNames.map((f, i) => (
                  <Bar key={f} dataKey={f} name={f} stackId="litros" fill={fuelColor(f)} stroke={theme.surface} strokeWidth={2}
                    radius={i === fuelNames.length - 1 ? [4, 4, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Medios de pago" subtitle="Equivalente en dólares a la tasa de cada jornada" empty={!methodRows.length}>
            <ResponsiveContainer>
              <BarChart data={methodRows} layout="vertical" margin={{ top: 4, right: 96, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={theme['chart-grid']} horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ ...axis, fill: theme.text }} axisLine={false} tickLine={false} width={112} />
                <Tooltip
                  cursor={{ fill: theme['chart-cursor'] }}
                  content={({ active, payload }) => {
                    const row = active && payload?.[0]?.payload as (typeof methodRows)[number] | undefined
                    if (!row) return null
                    return (
                      <ChartTooltipBox
                        title={row.name}
                        rows={[
                          { name: 'Equivalente', value: money(row.usd), color: theme['series-1'] },
                          { name: 'En bolívares', value: money(row.ves, 'VES') },
                        ]}
                        footer={methodTotal ? `${((row.usd / methodTotal) * 100).toFixed(1)} % del total cobrado` : undefined}
                      />
                    )
                  }}
                />
                <Bar dataKey="usd" fill={theme['series-1']} radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="usd"
                    position="right"
                    formatter={(v: unknown) => `${money(v)} · ${methodTotal ? ((Number(v) / methodTotal) * 100).toFixed(0) : 0}%`}
                    style={{ fill: theme.text, fontSize: 11, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {canDiff && (
            <ChartCard
              title="Sobrante / faltante por bombero"
              empty={!diffRows.length}
              legend={<Legend items={[{ name: 'Faltante', color: theme['diverge-neg'] }, { name: 'Sobrante', color: theme['diverge-pos'] }]} />}
            >
              <ResponsiveContainer>
                <BarChart data={diffRows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke={theme['chart-grid']} horizontal={false} />
                  {/* Las barras siempre nacen en 0: el dominio incluye el cero y deja aire para las etiquetas. */}
                  <XAxis
                    type="number"
                    tick={axis}
                    tickFormatter={(v) => (v < 0 ? `−$${Math.abs(v)}` : `$${v}`)}
                    axisLine={false}
                    tickLine={false}
                    domain={diffDomain}
                    ticks={diffTicks}
                  />
                  <YAxis type="category" dataKey="name" tick={{ ...axis, fill: theme.text }} axisLine={false} tickLine={false} width={112} />
                  <ReferenceLine x={0} stroke={theme['chart-axis']} />
                  <Tooltip
                    cursor={{ fill: theme['chart-cursor'] }}
                    content={({ active, payload }) => {
                      const row = active && payload?.[0]?.payload as (typeof diffRows)[number] | undefined
                      if (!row) return null
                      return (
                        <ChartTooltipBox
                          title={row.name}
                          rows={[{ name: row.diff < 0 ? 'Faltante' : 'Sobrante', value: signedMoney(row.diff), color: row.diff < 0 ? theme['diverge-neg'] : theme['diverge-pos'] }]}
                          footer={`${row.closures} cierres · ${row.short} con faltante · ${row.over} con sobrante`}
                        />
                      )
                    }}
                  />
                  <Bar dataKey="diff" radius={4}>
                    {diffRows.map((d) => <Cell key={d.name} fill={d.diff < 0 ? theme['diverge-neg'] : theme['diverge-pos']} />)}
                    <LabelList
                      dataKey="diff"
                      content={(props) => {
                        const { x = 0, y = 0, width = 0, height = 0, value } = props as { x?: number; y?: number; width?: number; height?: number; value?: number }
                        const negative = Number(value) < 0
                        // La etiqueta va en el extremo de la barra, hacia afuera según el signo.
                        const end = Number(x) + Number(width)
                        return (
                          <text x={end + (negative ? -6 : 6)} y={Number(y) + Number(height) / 2} dy={4} textAnchor={negative ? 'end' : 'start'} fill={theme.text} fontSize={11} fontWeight={600}>
                            {signedMoney(value)}
                          </text>
                        )
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      {canInventory && !!shrink.data?.length && (
        <div className="card animate-fade-up overflow-hidden">
          <h3 className="border-base border-b px-5 py-3.5 text-sm font-semibold">Merma por tanque</h3>
          <table className="table-base">
            <thead><tr><th>Tanque</th><th className="num">Litros</th><th className="num">$</th><th className="num">Fuera de tolerancia</th></tr></thead>
            <tbody>
              {shrink.data.map((t) => (
                <tr key={t.tank__name}><td>{t.tank__name}</td><td className="num">{signedLiters(t.variance_liters)}</td><td className="num">{signedMoney(t.variance_usd)}</td><td className="num">{t.out_of_tolerance}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
