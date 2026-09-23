import { KeyRound, LockOpen, Pencil, Plus, Power } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { roles, users } from '../../api/resources'
import type { User } from '../../api/types'
import { Can } from '../../auth/Can'
import { DataTable, Pagination } from '../../components/data/DataTable'
import { ErrorAlert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Field } from '../../components/ui/Field'
import { ConfirmModal, Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { dateTime } from '../../lib/format'
import { useStation } from '../../lib/station'
import { PermissionPicker } from './PermissionPicker'

type Draft = Partial<User> & { password?: string; stations?: string[] }

function CheckList({ items, value, onChange }: { items: { id: string | number; label: string }[]; value: (string | number)[]; onChange: (v: (string | number)[]) => void }) {
  const set = new Set(value.map(String))
  return (
    <div className="border-base grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-amber-600"
            checked={set.has(String(item.id))}
            onChange={(e) => onChange(e.target.checked ? [...value, item.id] : value.filter((v) => String(v) !== String(item.id)))}
          />
          {item.label}
        </label>
      ))}
      {!items.length && <span className="text-muted text-xs">Sin opciones</span>}
    </div>
  )
}

export function UsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const list = users.useList({ page, search: search || undefined })
  const roleList = roles.useAll()
  const { stations } = useStation()
  const create = users.useCreate()
  const update = users.useUpdate()
  const remove = users.useRemove()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pwdUser, setPwdUser] = useState<User | null>(null)
  const [newPwd, setNewPwd] = useState('')
  const [actionError, setActionError] = useState<unknown>(null)
  const [deactivating, setDeactivating] = useState<User | null>(null)

  const open = (user: User | null) => {
    create.reset()
    update.reset()
    setDraft(user ? { ...user, stations: user.station_ids } : { is_active: true, must_change_password: true, roles: [], permissions: [], stations: [] })
  }

  const save = async () => {
    if (!draft) return
    const body: Record<string, unknown> = {
      username: draft.username, first_name: draft.first_name ?? '', last_name: draft.last_name ?? '', email: draft.email ?? '',
      is_active: draft.is_active, must_change_password: draft.must_change_password, roles: draft.roles,
      permissions: draft.permissions, stations: draft.stations,
    }
    if (!draft.id) body.password = draft.password
    try {
      if (draft.id) await update.mutateAsync({ id: draft.id, body })
      else await create.mutateAsync(body)
      setDraft(null)
    } catch {
      /* se muestra en el modal */
    }
  }

  const setPassword = async () => {
    setActionError(null)
    try {
      await api(`users/${pwdUser!.id}/set-password`, { method: 'POST', body: { new_password: newPwd, must_change_password: true } })
      setPwdUser(null)
      setNewPwd('')
    } catch (e) {
      setActionError(e)
    }
  }

  const unlock = (user: User) => api(`users/${user.id}/unlock`, { method: 'POST' }).then(() => list.refetch())

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Cada usuario opera solo en las estaciones asignadas y con los permisos de sus roles más los adicionales."
        actions={<Can perm="accounts.add_user"><button className="btn-primary" onClick={() => open(null)}><Plus className="size-4" /> Nuevo usuario</button></Can>}
      />
      <input className="input mb-3 max-w-sm" placeholder="Buscar…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      <DataTable<User>
        rows={list.data?.results}
        loading={list.isLoading}
        columns={[
          { key: 'username', label: 'Usuario' },
          { key: 'name', label: 'Nombre', render: (u) => `${u.first_name} ${u.last_name}`.trim() || '—' },
          { key: 'roles', label: 'Roles', render: (u) => u.roles?.map((id) => roleList.data?.find((r) => r.id === id)?.name).filter(Boolean).join(', ') || '—' },
          { key: 'last_login', label: 'Último acceso', render: (u) => dateTime(u.last_login) },
          {
            key: 'status', label: 'Estado',
            render: (u) => (!u.is_active ? <Badge>Inactivo</Badge> : u.is_login_locked ? <Badge tone="red">Bloqueado</Badge> : <Badge tone="green">Activo</Badge>),
          },
        ]}
        actions={(u) => (
          <div className="flex justify-end gap-1">
            {u.is_login_locked && <Can perm="accounts.unlock_user"><button className="btn-ghost p-1.5" title="Desbloquear" onClick={() => unlock(u)}><LockOpen className="size-4" /></button></Can>}
            <Can perm="accounts.set_user_password"><button className="btn-ghost p-1.5" title="Restablecer contraseña" onClick={() => { setActionError(null); setPwdUser(u) }}><KeyRound className="size-4" /></button></Can>
            <Can perm="accounts.change_user"><button className="btn-ghost p-1.5" title="Editar" onClick={() => open(u)}><Pencil className="size-4" /></button></Can>
            {u.is_active && <Can perm="accounts.delete_user"><button className="btn-ghost p-1.5 text-red-600" title="Desactivar" onClick={() => setDeactivating(u)}><Power className="size-4" /></button></Can>}
          </div>
        )}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} count={list.data.count} onChange={setPage} />}
      />

      <Modal open={!!draft} title={draft?.id ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setDraft(null)} wide>
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Usuario *"><input className="input" value={draft.username ?? ''} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></Field>
              <Field label="Correo"><input className="input" type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
              <Field label="Nombre"><input className="input" value={draft.first_name ?? ''} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></Field>
              <Field label="Apellido"><input className="input" value={draft.last_name ?? ''} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></Field>
              {!draft.id && (
                <Field label="Contraseña inicial *" hint="Mínimo 10 caracteres.">
                  <input className="input" type="password" autoComplete="new-password" value={draft.password ?? ''} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                </Field>
              )}
              <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-600" checked={!!draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Activo</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-600" checked={!!draft.must_change_password} onChange={(e) => setDraft({ ...draft, must_change_password: e.target.checked })} /> Debe cambiar la contraseña al ingresar</label>
              </div>
            </div>
            <Field label="Estaciones">
              <CheckList items={stations.map((s) => ({ id: s.id, label: s.name }))} value={draft.stations ?? []} onChange={(v) => setDraft({ ...draft, stations: v.map(String) })} />
            </Field>
            <Field label="Roles">
              <CheckList items={(roleList.data ?? []).map((r) => ({ id: r.id, label: r.name }))} value={draft.roles ?? []} onChange={(v) => setDraft({ ...draft, roles: v.map(Number) })} />
            </Field>
            <div>
              <span className="label">Permisos adicionales</span>
              <PermissionPicker value={draft.permissions ?? []} onChange={(permissions) => setDraft({ ...draft, permissions })} />
            </div>
            <ErrorAlert error={create.error ?? update.error} />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn-primary" disabled={create.isPending || update.isPending} onClick={save}>Guardar</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!pwdUser} title={`Restablecer contraseña de ${pwdUser?.username}`} onClose={() => setPwdUser(null)}>
        <div className="space-y-4">
          <Field label="Nueva contraseña" hint="El usuario deberá cambiarla al ingresar.">
            <input className="input" type="password" autoComplete="new-password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </Field>
          <ErrorAlert error={actionError} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setPwdUser(null)}>Cancelar</button>
            <button className="btn-primary" disabled={newPwd.length < 10} onClick={setPassword}>Guardar</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deactivating} title="Desactivar usuario" danger confirmLabel="Desactivar" busy={remove.isPending}
        message={`${deactivating?.username} no podrá ingresar. Su historial se conserva.`}
        onClose={() => setDeactivating(null)}
        onConfirm={() => remove.mutateAsync(deactivating!.id).then(() => setDeactivating(null)).catch(() => undefined)}
      >
        <ErrorAlert error={remove.error} />
      </ConfirmModal>
    </div>
  )
}
