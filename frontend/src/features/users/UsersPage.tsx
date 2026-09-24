import { KeyRound, LockOpen, Pencil, Plus, Power } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { roles, users } from '../../api/resources'
import type { User } from '../../api/types'
import { Can } from '../../auth/Can'
import { DataTable, Pagination } from '../../components/data/DataTable'
import { ErrorAlert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { ChoiceChips } from '../../components/ui/ChoiceChips'
import { Field } from '../../components/ui/Field'
import { ConfirmModal, Modal, ModalActions } from '../../components/ui/Modal'
import { MultiSelect } from '../../components/ui/MultiSelect'
import { PageHeader } from '../../components/ui/PageHeader'
import { Switch } from '../../components/ui/Switch'
import { dateTime } from '../../lib/format'
import { useStation } from '../../lib/stationContext'
import { PermissionPicker } from './PermissionPicker'

type Draft = Partial<User> & { password?: string; stations?: string[] }

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-muted text-xs">{description}</p>}
      </div>
      {children}
    </section>
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
            {u.is_active && <Can perm="accounts.delete_user"><button className="btn-ghost p-1.5 text-negative" title="Desactivar" onClick={() => setDeactivating(u)}><Power className="size-4" /></button></Can>}
          </div>
        )}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} count={list.data.count} onChange={setPage} />}
      />

      <Modal open={!!draft} title={draft?.id ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setDraft(null)} size="xl">
        {draft && (
          <div className="space-y-7">
            <Section title="Datos del usuario">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                <Field label="Usuario *"><input className="input" value={draft.username ?? ''} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></Field>
                <Field label="Correo"><input className="input" type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
                <Field label="Nombre"><input className="input" value={draft.first_name ?? ''} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></Field>
                <Field label="Apellido"><input className="input" value={draft.last_name ?? ''} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></Field>
                {!draft.id && (
                  <Field label="Contraseña inicial *" hint="Mínimo 10 caracteres." className="md:col-span-2">
                    <input className="input" type="password" autoComplete="new-password" value={draft.password ?? ''} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                  </Field>
                )}
              </div>
            </Section>
            <Section title="Acceso">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Switch label="Usuario activo" description="Si se desactiva no podrá ingresar; su historial se conserva." checked={!!draft.is_active} onChange={(is_active) => setDraft({ ...draft, is_active })} />
                <Switch label="Cambiar contraseña al ingresar" description="Se le pedirá una contraseña nueva en su próximo acceso." checked={!!draft.must_change_password} onChange={(must_change_password) => setDraft({ ...draft, must_change_password })} />
              </div>
            </Section>
            <Section title="Roles" description="Los permisos de los roles se suman a los permisos adicionales.">
              <MultiSelect
                placeholder="Seleccione uno o varios roles…"
                searchPlaceholder="Buscar rol…"
                options={(roleList.data ?? []).map((r) => ({ value: String(r.id), label: r.name, hint: `${r.permissions?.length ?? 0} permisos · ${r.user_count} usuarios` }))}
                value={(draft.roles ?? []).map(String)}
                onChange={(v) => setDraft({ ...draft, roles: v.map(Number) })}
              />
            </Section>
            <Section title="Estaciones" description="El usuario solo verá y operará las estaciones seleccionadas.">
              <ChoiceChips
                choices={stations.map((st) => ({ value: st.id, label: st.name }))}
                value={draft.stations ?? []}
                onChange={(v) => setDraft({ ...draft, stations: v })}
                empty="No tiene estaciones asignadas para otorgar."
              />
            </Section>
            <Section title="Permisos adicionales" description="Opcional: permisos puntuales además de los que dan sus roles.">
              <PermissionPicker value={draft.permissions ?? []} onChange={(permissions) => setDraft({ ...draft, permissions })} />
            </Section>
            <ErrorAlert error={create.error ?? update.error} />
            <ModalActions>
              <button className="btn-secondary" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn-primary" disabled={create.isPending || update.isPending} onClick={save}>Guardar</button>
            </ModalActions>
          </div>
        )}
      </Modal>

      <Modal open={!!pwdUser} title={`Restablecer contraseña de ${pwdUser?.username}`} onClose={() => setPwdUser(null)} size="sm">
        <div className="space-y-4">
          <Field label="Nueva contraseña" hint="El usuario deberá cambiarla al ingresar.">
            <input className="input" type="password" autoComplete="new-password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </Field>
          <ErrorAlert error={actionError} />
          <ModalActions>
            <button className="btn-secondary" onClick={() => setPwdUser(null)}>Cancelar</button>
            <button className="btn-primary" disabled={newPwd.length < 10} onClick={setPassword}>Guardar</button>
          </ModalActions>
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
