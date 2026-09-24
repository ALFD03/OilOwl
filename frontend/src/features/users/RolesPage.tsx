import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { roles } from '../../api/resources'
import type { Role } from '../../api/types'
import { Can } from '../../auth/Can'
import { DataTable } from '../../components/data/DataTable'
import { ErrorAlert } from '../../components/ui/Alert'
import { Field } from '../../components/ui/Field'
import { ConfirmModal, Modal, ModalActions } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { PermissionPicker } from './PermissionPicker'

export function RolesPage() {
  const list = roles.useList({ page_size: 100 })
  const create = roles.useCreate()
  const update = roles.useUpdate()
  const remove = roles.useRemove()
  const [editing, setEditing] = useState<Partial<Role> | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)

  const save = async () => {
    if (!editing) return
    const body = { name: editing.name, permissions: editing.permissions ?? [] }
    try {
      if (editing.id) await update.mutateAsync({ id: editing.id, body })
      else await create.mutateAsync(body)
      setEditing(null)
    } catch {
      /* se muestra abajo */
    }
  }

  return (
    <div>
      <PageHeader
        title="Roles y permisos"
        description="Un rol agrupa permisos. Los usuarios heredan los permisos de sus roles y pueden tener permisos adicionales."
        actions={<Can perm="auth.add_group"><button className="btn-primary" onClick={() => { create.reset(); update.reset(); setEditing({ name: '', permissions: [] }) }}><Plus className="size-4" /> Nuevo rol</button></Can>}
      />
      <DataTable<Role>
        rows={list.data?.results}
        loading={list.isLoading}
        columns={[
          { key: 'name', label: 'Rol' },
          { key: 'permissions', label: 'Permisos', numeric: true, render: (r) => r.permissions?.length ?? 0 },
          { key: 'user_count', label: 'Usuarios', numeric: true },
        ]}
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <Can perm="auth.change_group"><button className="btn-ghost p-1.5" onClick={() => { update.reset(); setEditing(r) }} title="Editar"><Pencil className="size-4" /></button></Can>
            <Can perm="auth.delete_group"><button className="btn-ghost p-1.5 text-negative" onClick={() => setDeleting(r)} title="Eliminar"><Trash2 className="size-4" /></button></Can>
          </div>
        )}
      />
      <Modal open={!!editing} title={editing?.id ? 'Editar rol' : 'Nuevo rol'} onClose={() => setEditing(null)}>
        {editing && (
          <div className="space-y-4">
            <Field label="Nombre *"><input className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <PermissionPicker value={editing.permissions ?? []} onChange={(permissions) => setEditing({ ...editing, permissions })} />
            <ErrorAlert error={create.error ?? update.error} />
            <ModalActions>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn-primary" disabled={!editing.name || create.isPending || update.isPending} onClick={save}>Guardar</button>
            </ModalActions>
          </div>
        )}
      </Modal>
      <ConfirmModal
        open={!!deleting} title="Eliminar rol" danger confirmLabel="Eliminar" busy={remove.isPending}
        message={`Los ${deleting?.user_count ?? 0} usuario(s) con el rol "${deleting?.name}" perderán sus permisos.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await remove.mutateAsync(deleting!.id).then(() => setDeleting(null)).catch(() => undefined) }}
      >
        <ErrorAlert error={remove.error} />
      </ConfirmModal>
    </div>
  )
}
