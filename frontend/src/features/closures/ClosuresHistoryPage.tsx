import { ShieldCheck, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../../api/client'
import { closures } from '../../api/resources'
import type { ChainVerification, ClosureListItem } from '../../api/types'
import { Can } from '../../auth/Can'
import { DataTable, Pagination } from '../../components/data/DataTable'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { StatusBadge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { daysAgo, date, liters, money, signedMoney, today } from '../../lib/format'
import { useStation } from '../../lib/station'

export function ClosuresHistoryPage() {
  const { stationId } = useStation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ from: daysAgo(30), to: today(), status: '', result: '' })
  const [verification, setVerification] = useState<ChainVerification | null>(null)
  const [verifyError, setVerifyError] = useState<unknown>(null)
  const list = closures.useList(
    { station: stationId, page, shift__date__gte: filters.from, shift__date__lte: filters.to, status: filters.status || undefined, result: filters.result || undefined, ordering: '-shift__date' },
    { enabled: !!stationId },
  )

  const verify = async () => {
    setVerifyError(null)
    try {
      setVerification(await api<ChainVerification>('closures/verify-chain', { query: { station: stationId } }))
    } catch (e) {
      setVerifyError(e)
    }
  }

  const set = (patch: Partial<typeof filters>) => { setFilters({ ...filters, ...patch }); setPage(1) }

  return (
    <div>
      <PageHeader
        title="Historial de cierres"
        description="Los cierres bloqueados están encadenados criptográficamente: cualquier alteración se detecta al verificar."
        actions={<Can perm="closures.verify_chain"><button className="btn-secondary" onClick={verify}><ShieldCheck className="size-4" /> Verificar integridad</button></Can>}
      />
      {verification && (
        <div className="mb-3">
          {verification.valid ? (
            <Alert tone="success">Cadena íntegra: {verification.checked} cierre(s) bloqueado(s) verificados.</Alert>
          ) : (
            <Alert tone="error">
              <span className="inline-flex items-center gap-1 font-medium"><ShieldX className="size-4" /> Integridad comprometida</span> en el eslabón #{verification.chain_seq}: {verification.problem}.{' '}
              <button className="underline" onClick={() => navigate(`/cierres/${verification.broken_at}`)}>Ver cierre</button>
            </Alert>
          )}
        </div>
      )}
      <ErrorAlert error={verifyError} />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input w-40" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="Desde" />
        <input className="input w-40" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label="Hasta" />
        <select className="input w-40" value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Estado">
          <option value="">Todos los estados</option><option value="DRAFT">Borrador</option><option value="SUBMITTED">Enviado</option><option value="LOCKED">Bloqueado</option>
        </select>
        <select className="input w-40" value={filters.result} onChange={(e) => set({ result: e.target.value })} aria-label="Resultado">
          <option value="">Todos los resultados</option><option value="OVER">Sobrante</option><option value="SHORT">Faltante</option><option value="EXACT">Cuadrado</option>
        </select>
      </div>
      <DataTable<ClosureListItem>
        rows={list.data?.results as ClosureListItem[] | undefined}
        loading={list.isLoading}
        onRowClick={(c) => navigate(`/cierres/${c.id}`)}
        columns={[
          { key: 'shift_date', label: 'Fecha', render: (c) => date(c.shift_date) },
          { key: 'island_name', label: 'Isla' },
          { key: 'attendant_name', label: 'Bombero', render: (c) => c.attendant_name ?? '—' },
          { key: 'expected_liters', label: 'Litros', numeric: true, render: (c) => liters(c.expected_liters) },
          { key: 'expected_usd', label: 'Venta', numeric: true, render: (c) => money(c.expected_usd) },
          { key: 'diff_usd', label: 'Diferencia', numeric: true, render: (c) => <span className={Number(c.diff_usd) < 0 ? 'text-red-600' : ''}>{signedMoney(c.diff_usd)}</span> },
          { key: 'result', label: 'Resultado', render: (c) => (c.status === 'DRAFT' ? '—' : <StatusBadge value={c.result} />) },
          { key: 'status', label: 'Estado', render: (c) => <StatusBadge value={c.status} /> },
        ]}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} count={list.data.count} onChange={setPage} />}
      />
    </div>
  )
}
