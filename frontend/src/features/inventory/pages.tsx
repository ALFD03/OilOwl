import { Play } from 'lucide-react'
import { useState } from 'react'

import { deliveries, reconciliations, tankReadings, tanks } from '../../api/resources'
import type { Reconciliation } from '../../api/types'
import { Can } from '../../auth/Can'
import { CrudPage } from '../../components/data/CrudPage'
import { DataTable, Pagination } from '../../components/data/DataTable'
import { ErrorAlert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { dateTime, liters, nowLocal, signedLiters, signedMoney } from '../../lib/format'
import { useStation } from '../../lib/station'

type Row = Record<string, unknown> & { id: string }
const toIso = (field: string) => (v: Record<string, unknown>) => ({ ...v, [field]: new Date(String(v[field])).toISOString() })

function useTankNames() {
  const { stationId } = useStation()
  const list = tanks.useAll({ station: stationId }, { enabled: !!stationId })
  return (id: unknown) => list.data?.find((t) => t.id === id)?.name ?? '—'
}

export function TankReadingsPage() {
  const tankName = useTankNames()
  return (
    <CrudPage<Row>
      title="Mediciones de tanque" description="Medición física (varilla o sonda). Son registros permanentes."
      singular="medición" resource={tankReadings} perm="inventory.tankreading" stationScoped appendOnly searchable={false}
      columns={[
        { key: 'measured_at', label: 'Fecha', render: (r) => dateTime(r.measured_at as string) },
        { key: 'tank', label: 'Tanque', render: (r) => tankName(r.tank) },
        { key: 'liters', label: 'Litros', numeric: true, render: (r) => liters(r.liters) },
        { key: 'method', label: 'Método' },
        { key: 'notes', label: 'Notas' },
      ]}
      fields={[
        { name: 'tank', label: 'Tanque', type: 'relation', resource: tanks, stationScoped: true, required: true },
        { name: 'measured_at', label: 'Fecha y hora', type: 'datetime', required: true },
        { name: 'liters', label: 'Litros', type: 'decimal', required: true },
        { name: 'height_cm', label: 'Altura (cm)', type: 'decimal' },
        { name: 'method', label: 'Método', type: 'select', options: [{ value: 'STICK', label: 'Varilla' }, { value: 'PROBE', label: 'Sonda' }, { value: 'MANUAL', label: 'Manual' }], required: true },
        { name: 'notes', label: 'Notas' },
      ]}
      defaults={() => ({ method: 'STICK', measured_at: nowLocal() })}
      fromForm={toIso('measured_at')}
    />
  )
}

export function DeliveriesPage() {
  const tankName = useTankNames()
  return (
    <CrudPage<Row>
      title="Descargas de cisterna" singular="descarga" resource={deliveries} perm="inventory.delivery" stationScoped appendOnly searchable={false}
      columns={[
        { key: 'delivered_at', label: 'Fecha', render: (r) => dateTime(r.delivered_at as string) },
        { key: 'tank', label: 'Tanque', render: (r) => tankName(r.tank) },
        { key: 'liters', label: 'Litros', numeric: true, render: (r) => liters(r.liters) },
        { key: 'document', label: 'Guía' },
        { key: 'supplier', label: 'Proveedor' },
      ]}
      fields={[
        { name: 'tank', label: 'Tanque', type: 'relation', resource: tanks, stationScoped: true, required: true },
        { name: 'delivered_at', label: 'Fecha y hora', type: 'datetime', required: true },
        { name: 'liters', label: 'Litros recibidos', type: 'decimal', required: true },
        { name: 'document', label: 'Guía / factura' },
        { name: 'supplier', label: 'Proveedor' },
      ]}
      defaults={() => ({ delivered_at: nowLocal() })}
      fromForm={toIso('delivered_at')}
    />
  )
}

export function ReconciliationsPage() {
  const { stationId } = useStation()
  const [page, setPage] = useState(1)
  const list = reconciliations.useList({ station: stationId, page }, { enabled: !!stationId })
  const tankList = tanks.useAll({ station: stationId, is_active: true }, { enabled: !!stationId })
  const run = reconciliations.useAction<{ tank: string; closing_reading: string; notes: string }>('run', { detail: false })
  const [open, setOpen] = useState(false)
  const [tank, setTank] = useState('')
  const [reading, setReading] = useState('')
  const readings = tankReadings.useList({ tank, page_size: 10, ordering: '-measured_at' }, { enabled: !!tank })

  return (
    <div>
      <PageHeader
        title="Conciliación y merma"
        description="Inventario esperado (inicial + descargas − ventas) contra lo medido. La diferencia es la merma en L, $ y Bs."
        actions={<Can perm="inventory.run_reconciliation"><button className="btn-primary" onClick={() => { run.reset(); setOpen(true) }}><Play className="size-4" /> Conciliar</button></Can>}
      />
      <DataTable<Reconciliation>
        rows={list.data?.results}
        loading={list.isLoading}
        columns={[
          { key: 'created_at', label: 'Fecha', render: (r) => dateTime(r.created_at) },
          { key: 'tank_name', label: 'Tanque' },
          { key: 'opening_liters', label: 'Inicial', numeric: true, render: (r) => liters(r.opening_liters) },
          { key: 'deliveries_liters', label: '+ Descargas', numeric: true, render: (r) => liters(r.deliveries_liters) },
          { key: 'sold_liters', label: '− Vendido', numeric: true, render: (r) => liters(r.sold_liters) },
          { key: 'expected_liters', label: 'Esperado', numeric: true, render: (r) => liters(r.expected_liters) },
          { key: 'measured_liters', label: 'Medido', numeric: true, render: (r) => liters(r.measured_liters) },
          { key: 'variance_liters', label: 'Diferencia', numeric: true, render: (r) => <span className={Number(r.variance_liters) < 0 ? 'text-red-600' : ''}>{signedLiters(r.variance_liters)} ({Number(r.variance_pct).toFixed(2)} %)</span> },
          { key: 'variance_usd', label: '$ / Bs', numeric: true, render: (r) => <div>{signedMoney(r.variance_usd)}<div className="text-muted text-xs">{signedMoney(r.variance_ves, 'VES')}</div></div> },
          { key: 'within_tolerance', label: 'Tolerancia', render: (r) => (r.within_tolerance ? <Badge tone="green">Dentro</Badge> : <Badge tone="red">Fuera</Badge>) },
        ]}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} count={list.data.count} onChange={setPage} />}
      />
      <Modal open={open} title="Conciliar tanque" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <Field label="Tanque *">
            <select className="input" value={tank} onChange={(e) => { setTank(e.target.value); setReading('') }}>
              <option value="">Seleccione…</option>
              {tankList.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Medición de cierre *" hint="Se concilia desde la última conciliación hasta esta medición.">
            <select className="input" value={reading} onChange={(e) => setReading(e.target.value)} disabled={!tank}>
              <option value="">Seleccione…</option>
              {readings.data?.results.map((r) => <option key={r.id} value={r.id}>{dateTime(r.measured_at)} · {liters(r.liters)}</option>)}
            </select>
          </Field>
          <ErrorAlert error={run.error} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={!tank || !reading || run.isPending} onClick={() => run.mutateAsync({ body: { tank, closing_reading: reading, notes: '' } }).then(() => setOpen(false)).catch(() => undefined)}>Conciliar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
