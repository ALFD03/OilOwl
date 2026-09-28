/**
 * Configuración de la tabla de aforo de cada tanque: puntos {cm → litros}. Las mediciones se
 * registran en cm y los litros se interpolan linealmente entre los dos puntos más cercanos.
 */
import { ClipboardPaste, Plus, Ruler, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { tanks } from '../../api/resources'
import type { Tank } from '../../api/types'
import { usePermission } from '../../auth/AuthContext'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { Modal, ModalActions } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Spinner } from '../../components/ui/Spinner'
import { cn } from '../../lib/cn'
import { liters } from '../../lib/format'
import { useStation } from '../../lib/stationContext'
import { calibrationError, calibrationRange, litersAt, parseCalibrationText } from '../../lib/tankMath'

interface Point {
  cm: string
  liters: string
}

const pointsOf = (tank: Tank): Point[] => (tank.calibration ?? []).map((p) => ({ cm: String(Number(p.cm)), liters: String(Number(p.liters)) }))

function PasteModal({ onApply, onClose }: { onApply: (points: Point[]) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const parsed = parseCalibrationText(text)
  return (
    <Modal open title="Pegar tabla de aforo" onClose={onClose} size="md" description="Pegue las filas desde una hoja de cálculo o el certificado de aforo. Reemplaza la tabla actual.">
      <div className="space-y-4">
        <Field label="Una fila por línea: centímetros y litros" hint="Separados por tabulador, punto y coma o espacio. Se acepta coma o punto decimal.">
          <textarea className="input min-h-56 font-mono text-xs" placeholder={'0\t0\n10\t850,5\n20\t1750'} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {text && (
          <p className="text-muted text-sm">
            {parsed.points.length} punto(s) reconocido(s).
            {parsed.errors.length > 0 && <span className="text-warning"> Líneas no válidas: {parsed.errors.slice(0, 10).join(', ')}{parsed.errors.length > 10 ? '…' : ''}.</span>}
          </p>
        )}
        <ModalActions>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={parsed.points.length === 0} onClick={() => { onApply(parsed.points); onClose() }}>Usar esta tabla</button>
        </ModalActions>
      </div>
    </Modal>
  )
}

function CalibrationEditor({ tank, others }: { tank: Tank; others: Tank[] }) {
  const canEdit = usePermission('inventory.change_tank')
  const save = tanks.useUpdate()
  const [baseline, setBaseline] = useState<Point[]>(() => pointsOf(tank))
  const [points, setPoints] = useState<Point[]>(baseline)
  const [pasting, setPasting] = useState(false)
  const [probe, setProbe] = useState('')
  const [saved, setSaved] = useState(false)

  const error = calibrationError(points)
  const range = calibrationRange(points)
  const probeLiters = litersAt(points, probe)
  const maxLiters = points.reduce((max, p) => Math.max(max, Number(p.liters) || 0), 0)
  const overCapacity = maxLiters > Number(tank.capacity)
  const dirty = JSON.stringify(points) !== JSON.stringify(baseline)

  const update = (next: Point[]) => {
    setSaved(false)
    setPoints(next)
  }
  const setPoint = (index: number, field: keyof Point, value: string) => update(points.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  const sortedForSave = [...points].sort((a, b) => Number(a.cm) - Number(b.cm))

  const submit = () =>
    save
      .mutateAsync({ id: tank.id, body: { calibration: sortedForSave } as never })
      .then((updated) => { const next = pointsOf(updated); setBaseline(next); setPoints(next); setSaved(true) })
      .catch(() => undefined)

  return (
    <div className="space-y-4">
      <div className="card animate-fade-up space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">{tank.code} · {tank.name}</h2>
            <p className="text-muted mt-1 text-sm">{tank.fuel_type_name} · capacidad {liters(tank.capacity)}{range && ` · de ${range[0]} a ${range[1]} cm`}</p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {others.length > 0 && (
                <select className="input w-auto py-1.5 text-sm" value="" onChange={(e) => { const source = others.find((t) => t.id === e.target.value); if (source) update(pointsOf(source)) }}>
                  <option value="">Copiar de otro tanque…</option>
                  {others.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
                </select>
              )}
              <button className="btn-secondary" onClick={() => setPasting(true)}><ClipboardPaste className="size-4" /> Pegar tabla</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[14rem_1fr] sm:items-end">
          <Field label="Probar una medición (cm)">
            <input className="input" type="number" step="0.01" min={0} value={probe} onChange={(e) => setProbe(e.target.value)} />
          </Field>
          <div className="text-sm sm:pb-2.5">
            {probe === '' ? <span className="text-muted">Escriba una altura para ver los litros que resultan.</span>
              : probeLiters === null ? <span className="text-warning">Fuera de la tabla{range ? ` (${range[0]}–${range[1]} cm)` : ''}.</span>
              : <span>= <strong className="text-gold">{liters(probeLiters)}</strong></span>}
          </div>
        </div>
      </div>

      <div className="card animate-fade-up overflow-hidden">
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="table-base">
            <thead className="sticky top-0 z-10 bg-[var(--surface)]">
              <tr><th className="w-12">#</th><th className="num">Altura (cm)</th><th className="num">Litros</th>{canEdit && <th className="w-px" />}</tr>
            </thead>
            <tbody>
              {points.length === 0 && (
                <tr><td colSpan={4} className="text-muted py-8 text-center text-sm">Sin tabla de aforo. Agregue puntos o pegue la tabla del certificado.</td></tr>
              )}
              {points.map((p, i) => (
                <tr key={i}>
                  <td className="text-muted">{i + 1}</td>
                  <td className="num">
                    <input className="input ml-auto w-32 py-1 text-right tabular-nums" type="number" step="0.01" min={0} disabled={!canEdit} aria-label={`Altura del punto ${i + 1}`} value={p.cm} onChange={(e) => setPoint(i, 'cm', e.target.value)} />
                  </td>
                  <td className="num">
                    <input className="input ml-auto w-40 py-1 text-right tabular-nums" type="number" step="0.001" min={0} disabled={!canEdit} aria-label={`Litros del punto ${i + 1}`} value={p.liters} onChange={(e) => setPoint(i, 'liters', e.target.value)} />
                  </td>
                  {canEdit && (
                    <td><button className="btn-ghost p-1.5" aria-label={`Quitar punto ${i + 1}`} onClick={() => update(points.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="border-base border-t px-5 py-3">
            <button className="btn-secondary" onClick={() => { const last = sortedForSave[sortedForSave.length - 1]; update([...points, { cm: last ? String(Number(last.cm) + 1) : '0', liters: last ? last.liters : '0' }]) }}>
              <Plus className="size-4" /> Agregar punto
            </button>
          </div>
        )}
      </div>

      {error && <Alert tone="warning">{error}</Alert>}
      {!error && overCapacity && <Alert tone="warning">El último punto ({liters(maxLiters)}) supera la capacidad del tanque ({liters(tank.capacity)}). Revise la tabla o la capacidad.</Alert>}
      <ErrorAlert error={save.error} />
      {saved && !dirty && <Alert tone="success">Tabla de aforo guardada. Las mediciones nuevas usarán estos valores; las anteriores conservan sus litros.</Alert>}
      {canEdit && (
        <div className="flex justify-end gap-2">
          {dirty && <button className="btn-secondary" onClick={() => update(baseline)}>Descartar cambios</button>}
          <button className="btn-primary" disabled={!dirty || !!error || save.isPending} onClick={submit}><Save className="size-4" /> Guardar tabla</button>
        </div>
      )}
      {pasting && <PasteModal onApply={update} onClose={() => setPasting(false)} />}
    </div>
  )
}

export function CalibrationPage() {
  const { stationId } = useStation()
  const list = tanks.useAll({ station: stationId, is_active: true }, { enabled: !!stationId })
  const [selected, setSelected] = useState('')
  const current = list.data?.find((t) => t.id === selected) ?? list.data?.[0]

  return (
    <div>
      <PageHeader
        title="Aforo de tanques"
        description="Tabla de cada tanque que convierte la medición en centímetros a litros. Se usa al abrir y cerrar la jornada y en las mediciones puntuales."
      />
      {list.isLoading ? <Spinner full /> : !list.data?.length ? (
        <div className="card text-muted p-12 text-center text-sm">No hay tanques activos en la estación. Créelos en Configuración › Tanques.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[16rem_1fr]">
          <nav className="flex flex-col gap-2" aria-label="Tanques">
            {list.data.map((t) => {
              const points = t.calibration?.length ?? 0
              return (
                <button
                  key={t.id}
                  className={cn('card card-interactive flex items-center gap-3 p-3 text-left', current?.id === t.id && 'ring-2 ring-brand-500/60')}
                  onClick={() => setSelected(t.id)}
                >
                  <Ruler className="text-gold size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.code} · {t.name}</span>
                    <span className="text-muted block text-xs">{t.fuel_type_name}</span>
                  </span>
                  {points >= 2 ? <Badge tone="green">{points} pts</Badge> : <Badge tone="amber">Sin tabla</Badge>}
                </button>
              )
            })}
          </nav>
          {current && <CalibrationEditor key={current.id} tank={current} others={list.data.filter((t) => t.id !== current.id && (t.calibration?.length ?? 0) >= 2)} />}
        </div>
      )}
    </div>
  )
}
