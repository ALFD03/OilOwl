import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { exchangeRates, shiftTemplates, shifts, tanks } from '../../api/resources'
import type { Shift } from '../../api/types'
import { Can } from '../../auth/Can'
import { usePermission } from '../../auth/AuthContext'
import { DataTable, Pagination } from '../../components/data/DataTable'
import { TankHeightInputs, type TankHeightRow } from '../../components/inventory/TankHeightInputs'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { StatusBadge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { Modal, ModalActions } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { date, rate, today } from '../../lib/format'
import { tankHeightsComplete, toTankReadings, type TankHeights } from '../../lib/tankMath'
import { useStation } from '../../lib/stationContext'

export function ShiftsPage() {
  const { stationId } = useStation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const list = shifts.useList({ station: stationId, page }, { enabled: !!stationId })
  const templates = shiftTemplates.useAll({ station: stationId, is_active: true }, { enabled: !!stationId })
  const current = exchangeRates.useList({ page_size: 1 })
  const create = shifts.useCreate()
  const canOverride = usePermission('rates.override_rate')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: today(), shift_template: '', rate: '', notes: '' })
  const [heights, setHeights] = useState<TankHeights>({})
  const tankList = tanks.useAll({ station: stationId, is_active: true }, { enabled: !!stationId && open })

  const latest = current.data?.results[0]
  const tankRows: TankHeightRow[] = (tankList.data ?? []).map((t) => ({ id: t.id, code: t.code, name: t.name, fuel: t.fuel_type_name, calibration: t.calibration }))
  const tanksReady = !tankList.isLoading && tankHeightsComplete(tankRows, heights)

  const submit = async () => {
    try {
      const shift = await create.mutateAsync({
        station: stationId,
        date: form.date,
        shift_template: form.shift_template || null,
        notes: form.notes,
        tank_readings: toTankReadings(tankRows, heights),
        ...(form.rate ? { rate: form.rate } : {}),
      } as Partial<Shift>)
      setOpen(false)
      navigate(`/jornadas/${shift.id}`)
    } catch {
      /* se muestra en el modal */
    }
  }

  return (
    <div>
      <PageHeader
        title="Jornadas"
        description="Abra la jornada con la medición de los tanques en cm: se congela la tasa del día y luego se registran todas las islas en la misma página."
        actions={<Can perm="operations.add_shift"><button className="btn-primary" onClick={() => { create.reset(); setHeights({}); setOpen(true) }}><Plus className="size-4" /> Abrir jornada</button></Can>}
      />
      <DataTable<Shift>
        rows={list.data?.results}
        loading={list.isLoading}
        onRowClick={(s) => navigate(`/jornadas/${s.id}`)}
        columns={[
          { key: 'date', label: 'Fecha', render: (s) => date(s.date) },
          { key: 'shift_name', label: 'Turno', render: (s) => s.shift_name ?? 'Día completo' },
          { key: 'rate', label: 'Tasa', numeric: true, render: (s) => rate(s.rate) },
          { key: 'closures_total', label: 'Islas', numeric: true },
          { key: 'status', label: 'Estado', render: (s) => <StatusBadge value={s.status} /> },
        ]}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} count={list.data.count} onChange={setPage} />}
      />
      <Modal open={open} title="Abrir jornada" onClose={() => setOpen(false)} size="lg">
        <div className="space-y-4">
          {latest ? (
            <Alert>Tasa BCV vigente: <strong>{rate(latest.rate)} Bs/$</strong> (fecha valor {date(latest.valid_date)}).</Alert>
          ) : (
            <Alert tone="warning">No hay tasa registrada. Consulte el BCV en la sección Tasa BCV.</Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha *"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Turno">
              <select className="input" value={form.shift_template} onChange={(e) => setForm({ ...form, shift_template: e.target.value })}>
                <option value="">Día completo</option>
                {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>
          {canOverride && (
            <Field
              label="Tasa manual (opcional)"
              hint="Déjela vacía para usar la tasa oficial vigente."
              error={form.rate !== '' && !(Number(form.rate) > 0) ? 'La tasa debe ser mayor que cero' : undefined}
            >
              <input className="input" type="number" min="0.000001" step="any" placeholder={latest ? rate(latest.rate) : ''} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </Field>
          )}
          <Field label="Observaciones"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div>
            <span className="label">Medición inicial de tanques *</span>
            <p className="text-muted mb-2 text-xs">Altura en centímetros; los litros salen de la tabla de aforo de cada tanque.</p>
            <TankHeightInputs rows={tankRows} values={heights} onChange={setHeights} />
          </div>
          <ErrorAlert error={create.error} />
          <ModalActions>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={create.isPending || !tanksReady || (form.rate !== '' && !(Number(form.rate) > 0))} title={tanksReady ? '' : 'Indique la medición en cm de cada tanque'} onClick={submit}>Abrir</button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  )
}
