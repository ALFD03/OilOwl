import { useState } from 'react'

import { auditLogs } from '../../api/resources'
import type { AuditLog } from '../../api/types'
import { DataTable, Pagination } from '../../components/data/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { dateTime } from '../../lib/format'

const ACTION_TONE: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'gray'> = {
  lock: 'green', login_failed: 'red', delete: 'red', deactivate: 'red', update: 'amber', reopen: 'amber', create: 'blue', open: 'blue',
}

export function AuditPage() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [model, setModel] = useState('')
  const [detail, setDetail] = useState<AuditLog | null>(null)
  const list = auditLogs.useList({ page, action: action || undefined, model: model || undefined })

  return (
    <div>
      <PageHeader title="Auditoría" description="Bitácora inalterable de todas las operaciones: quién, qué, cuándo y desde dónde." />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-48" placeholder="Acción (lock, update…)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} />
        <input className="input max-w-48" placeholder="Modelo (closure, user…)" value={model} onChange={(e) => { setModel(e.target.value); setPage(1) }} />
      </div>
      <DataTable<AuditLog>
        rows={list.data?.results}
        loading={list.isLoading}
        onRowClick={setDetail}
        columns={[
          { key: 'ts', label: 'Fecha', render: (r) => dateTime(r.ts) },
          { key: 'username', label: 'Usuario', render: (r) => r.username ?? '—' },
          { key: 'action', label: 'Acción', render: (r) => <Badge tone={ACTION_TONE[r.action] ?? 'gray'}>{r.action}</Badge> },
          { key: 'model', label: 'Registro', render: (r) => `${r.app_label}.${r.model}` },
          { key: 'object_repr', label: 'Detalle', className: 'max-w-72 truncate' },
          { key: 'ip', label: 'IP', render: (r) => r.ip ?? '—' },
        ]}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} count={list.data.count} onChange={setPage} />}
      />
      <Modal open={!!detail} title="Detalle de auditoría" onClose={() => setDetail(null)}>
        {detail && (
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            {(['before', 'after'] as const).map((k) => (
              <div key={k}>
                <div className="label">{k === 'before' ? 'Antes' : 'Después'}</div>
                <pre className="border-base max-h-96 overflow-auto rounded-lg border p-2">{detail[k] ? JSON.stringify(detail[k], null, 2) : '—'}</pre>
              </div>
            ))}
            <div className="text-muted sm:col-span-2">{detail.user_agent}</div>
          </div>
        )}
      </Modal>
    </div>
  )
}
