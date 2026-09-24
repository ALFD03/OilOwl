import { RefreshCw } from 'lucide-react'

import { exchangeRates } from '../../api/resources'
import { Can } from '../../auth/Can'
import { CrudPage } from '../../components/data/CrudPage'
import { ErrorAlert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { date, rate, today } from '../../lib/format'

type Row = Record<string, unknown> & { id: string }

function FetchButton() {
  const fetchRate = exchangeRates.useAction<{ date?: string }>('fetch', { detail: false })
  return (
    <Can perm="rates.fetch_rate">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" disabled={fetchRate.isPending} onClick={() => fetchRate.mutate({})}>
          <RefreshCw className={`size-4 ${fetchRate.isPending ? 'animate-spin' : ''}`} /> Consultar BCV
        </button>
        {fetchRate.error && <ErrorAlert error={fetchRate.error} />}
      </div>
    </Can>
  )
}

export function RatesPage() {
  return (
    <CrudPage<Row>
      title="Tasa oficial BCV"
      description="Se consulta automáticamente cada día. Una tasa manual queda registrada y auditada; nunca se edita."
      singular="tasa manual"
      resource={exchangeRates}
      perm="rates.exchangerate"
      addPerm="rates.override_rate"
      appendOnly
      searchable={false}
      headerActions={<FetchButton />}
      columns={[
        { key: 'valid_date', label: 'Fecha valor', render: (r) => date(r.valid_date as string) },
        { key: 'rate', label: 'Bs por USD', numeric: true, render: (r) => rate(r.rate) },
        { key: 'source', label: 'Origen', render: (r) => (r.source === 'BCV' ? <Badge tone="green">BCV</Badge> : <Badge tone="amber">Manual</Badge>) },
        { key: 'notes', label: 'Notas' },
      ]}
      fields={[
        { name: 'valid_date', label: 'Fecha valor', type: 'date', required: true },
        { name: 'rate', label: 'Bs por USD', type: 'decimal', required: true },
        { name: 'notes', label: 'Motivo', required: true, span: 2 },
      ]}
      defaults={{ valid_date: today() }}
    />
  )
}
