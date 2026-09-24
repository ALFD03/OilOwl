/**
 * Página CRUD genérica: listado con búsqueda y paginación, alta/edición en modal y
 * desactivación, todo condicionado a los permisos del usuario.
 */
import { Pencil, Plus, Power, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm, type FieldValues, type Path } from 'react-hook-form'

import { ApiError } from '../../api/client'
import type { Resource } from '../../api/resource'
import { Can } from '../../auth/Can'
import { usePermission } from '../../auth/AuthContext'
import { useStation } from '../../lib/stationContext'
import { ErrorAlert } from '../ui/Alert'
import { ConfirmModal, Modal, ModalActions } from '../ui/Modal'
import { PageHeader } from '../ui/PageHeader'
import { DataTable, Pagination, type Column } from './DataTable'
import { FormFields, type FieldSpec } from './FormFields'

type Row = Record<string, unknown> & { id: string | number }

export interface CrudConfig<T extends Row = Row> {
  title: string
  description?: string
  singular: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resource: Resource<any>
  /** Prefijo de permisos, p. ej. "catalog.island" → catalog.view_island, catalog.add_island… */
  perm: string
  /** Sobrescribe el permiso de alta (por defecto <app>.add_<modelo>). */
  addPerm?: string
  columns: Column<T>[]
  fields: FieldSpec[]
  stationScoped?: boolean
  searchable?: boolean
  appendOnly?: boolean
  canEdit?: boolean
  canDeactivate?: boolean
  /** Valores iniciales del alta; una función se evalúa al abrir el formulario. */
  defaults?: Record<string, unknown> | (() => Record<string, unknown>)
  params?: Record<string, string | number | boolean>
  toForm?: (row: T) => Record<string, unknown>
  fromForm?: (values: Record<string, unknown>, editing: boolean) => Record<string, unknown>
  extraActions?: (row: T) => ReactNode
  headerActions?: ReactNode
}

function permName(prefix: string, verb: string) {
  const [app, model] = prefix.split('.')
  return `${app}.${verb}_${model}`
}

export function CrudPage<T extends Row>(config: CrudConfig<T>) {
  const { stationId } = useStation()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<T | null>(null)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<T | null>(null)
  const canChange = usePermission(permName(config.perm, 'change'))

  const params = {
    page,
    search: config.searchable === false ? undefined : search || undefined,
    ...(config.stationScoped ? { station: stationId } : {}),
    ...config.params,
  }
  const list = config.resource.useList(params, { enabled: !config.stationScoped || !!stationId })
  const create = config.resource.useCreate()
  const update = config.resource.useUpdate()
  const remove = config.resource.useRemove()

  const form = useForm<FieldValues>()
  const open = (row: T | null) => {
    const values = row ? (config.toForm ? config.toForm(row) : { ...row }) : { is_active: true, ...(typeof config.defaults === 'function' ? config.defaults() : config.defaults) }
    // Los selects de relaciones trabajan con el id en texto.
    form.reset(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null || v === undefined ? '' : v])))
    create.reset()
    update.reset()
    if (row) setEditing(row)
    else setCreating(true)
  }
  const close = () => {
    setEditing(null)
    setCreating(false)
  }

  const submit = form.handleSubmit(async (values) => {
    const isEdit = !!editing
    let body: Record<string, unknown> = Object.fromEntries(
      config.fields.filter((f) => !(isEdit && (f.readOnlyOnEdit || f.hideOnEdit)) && !(!isEdit && f.hideOnCreate)).map((f) => [f.name, values[f.name]]),
    )
    if (config.stationScoped && !isEdit) body.station = stationId
    if (config.fromForm) body = config.fromForm(body, isEdit)
    try {
      if (isEdit) await update.mutateAsync({ id: editing!.id, body })
      else await create.mutateAsync(body)
      close()
    } catch (error) {
      if (error instanceof ApiError) {
        Object.entries(error.fieldErrors).forEach(([field, messages]) => {
          if (config.fields.some((f) => f.name === field)) form.setError(field as Path<FieldValues>, { message: [messages].flat().join(' ') })
        })
      }
    }
  })

  const data = list.data
  const mutationError = create.error ?? update.error
  const showActions = (config.canEdit !== false && !config.appendOnly && canChange) || config.extraActions || config.canDeactivate !== false

  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <>
            {config.headerActions}
            <Can perm={config.addPerm ?? permName(config.perm, 'add')}>
              <button className="btn-primary" onClick={() => open(null)}><Plus className="size-4" /> {config.appendOnly ? 'Registrar' : 'Nuevo'}</button>
            </Can>
          </>
        }
      />
      {config.searchable !== false && (
        <div className="relative mb-3 max-w-sm">
          <Search className="text-muted absolute top-2.5 left-3 size-4" />
          <input className="input pl-9" placeholder="Buscar…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
      )}
      <ErrorAlert error={list.error} />
      <DataTable
        columns={config.columns}
        rows={data?.results as T[] | undefined}
        loading={list.isLoading}
        actions={
          showActions
            ? (row) => (
                <div className="flex justify-end gap-1">
                  {config.extraActions?.(row)}
                  {!config.appendOnly && config.canEdit !== false && canChange && (
                    <button className="btn-ghost p-1.5" title="Editar" onClick={() => open(row)}><Pencil className="size-4" /></button>
                  )}
                  {!config.appendOnly && config.canDeactivate !== false && row.is_active !== false && (
                    <Can perm={permName(config.perm, 'delete')}>
                      <button className="btn-ghost p-1.5 text-negative" title="Desactivar" onClick={() => setDeactivating(row)}><Power className="size-4" /></button>
                    </Can>
                  )}
                </div>
              )
            : undefined
        }
        footer={data && <Pagination page={data.page} pages={data.pages} count={data.count} onChange={setPage} />}
      />

      <Modal open={creating || !!editing} title={`${editing ? 'Editar' : 'Registrar'} ${config.singular}`} onClose={close}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormFields fields={config.fields} form={form} editing={!!editing} />
          <ErrorAlert error={mutationError} />
          {config.appendOnly && <p className="text-muted text-xs">Este registro no podrá modificarse ni eliminarse después de guardarlo.</p>}
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={close}>Cancelar</button>
            <button className="btn-primary" disabled={form.formState.isSubmitting}>Guardar</button>
          </ModalActions>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deactivating}
        title={`Desactivar ${config.singular}`}
        message="El registro dejará de estar disponible para nuevas operaciones. El historial se conserva."
        confirmLabel="Desactivar"
        danger
        busy={remove.isPending}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(deactivating!.id)
            setDeactivating(null)
          } catch {
            /* el error se muestra en el modal */
          }
        }}
      >
        <ErrorAlert error={remove.error} />
      </ConfirmModal>
    </div>
  )
}
