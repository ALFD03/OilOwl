import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from '../../api/client'
import { usePermission } from '../../auth/AuthContext'
import { ErrorAlert } from '../../components/ui/Alert'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { daysAgo, liters, money, signedLiters, signedMoney, today } from '../../lib/format'
import { useStation } from '../../lib/station'

type Params = { station: string; from: string; to: string }
const METHOD_LABEL: Record<string, string> = { CASH_VES: 'Efectivo Bs', CASH_USD: 'Efectivo $', POS: 'Punto de venta', BIOPAGO: 'BioPago' }
const PIE_COLORS = ['#d97706', '#0284c7', '#059669', '#7c3aed']
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }
const axis = { fontSize: 11, fill: 'var(--muted)' }

function useReport<T>(name: string, params: Params, enabled = true) {
  return useQuery({ queryKey: ['reports', name, params], queryFn: () => api<T>(`reports/${name}`, { query: params }), enabled: enabled && !!params.station })
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-64">{children}</div>
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

  const fuelNames = [...new Set(fuels.data?.map((f) => f.fuel) ?? [])]
  const fuelColors = Object.fromEntries(fuels.data?.map((f) => [f.fuel, f.color]) ?? [])
  const fuelRows = Object.values(
    (fuels.data ?? []).reduce<Record<string, Record<string, number | string>>>((acc, f) => {
      acc[f.date] ??= { date: f.date.slice(5) }
      acc[f.date][f.fuel] = Number(f.liters)
      return acc
    }, {}),
  )
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
        <StatCard label="Ventas" value={money(s.sales_usd)} sub={money(s.sales_ves, 'VES')} />
        <StatCard label="Litros despachados" value={liters(s.liters)} sub={`${s.closures ?? 0} cierres`} />
        <StatCard label="Sobrante / faltante" value={signedMoney(s.diff_usd)} sub={`${signedLiters(s.diff_liters)} · ${s.short ?? 0} faltantes`} tone={Number(s.diff_usd) < 0 ? 'bad' : undefined} />
        <StatCard label="Merma de tanques" value={signedLiters(s.shrinkage_liters)} sub={`${signedMoney(s.shrinkage_usd)} · ${s.reconciliations_out_of_tolerance ?? 0} fuera de tolerancia`} tone={Number(s.shrinkage_liters) < 0 ? 'bad' : undefined} />
      </div>

      {canSales && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Ventas por día ($)">
            <ResponsiveContainer>
              <LineChart data={sales.data?.map((d) => ({ date: d.date.slice(5), usd: Number(d.usd), diff: Number(d.diff_usd) }))}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={axis} />
                <YAxis tick={axis} width={50} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="usd" name="Ventas" stroke="#d97706" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="diff" name="Diferencia" stroke="#dc2626" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Litros por día y combustible">
            <ResponsiveContainer>
              <BarChart data={fuelRows}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={axis} />
                <YAxis tick={axis} width={50} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => liters(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {fuelNames.map((f) => <Bar key={f} dataKey={f} stackId="l" fill={fuelColors[f] ?? '#64748b'} />)}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Medios de pago ($ equivalentes)">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={methods.data?.map((m) => ({ name: METHOD_LABEL[m.method] ?? m.method, value: Number(m.amount_usd) }))} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%">
                  {methods.data?.map((m, i) => <Cell key={m.method} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          {canDiff && (
            <ChartCard title="Sobrante / faltante por bombero ($)">
              <ResponsiveContainer>
                <BarChart data={diffs.data?.by_attendant.map((d) => ({ name: d.attendant__name ?? 'Sin asignar', diff: Number(d.diff_usd) }))} layout="vertical">
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={axis} />
                  <YAxis type="category" dataKey="name" tick={axis} width={110} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => signedMoney(v)} />
                  <Bar dataKey="diff" name="Diferencia">
                    {diffs.data?.by_attendant.map((d, i) => <Cell key={i} fill={Number(d.diff_usd) < 0 ? '#dc2626' : '#0284c7'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      {canInventory && !!shrink.data?.length && (
        <div className="card overflow-hidden">
          <h3 className="border-base border-b px-4 py-3 text-sm font-semibold">Merma por tanque</h3>
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
