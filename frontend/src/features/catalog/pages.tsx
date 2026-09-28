/** Catálogos: todos construidos sobre el mismo CrudPage declarativo. */
import { stations, fuelTypes, islands, pumps, terminals, attendants, denominations, tanks, shiftTemplates, fuelPrices } from '../../api/resources'
import type { Column } from '../../components/data/DataTable'
import { activeColumn } from '../../components/data/columns'
import { CrudPage } from '../../components/data/CrudPage'
import type { FieldSpec } from '../../components/data/FormFields'
import { dateTime, liters, money, nowLocal } from '../../lib/format'

type Row = Record<string, unknown> & { id: string }

/** Elementos con código automático (ESTACIÓN-TIPO-#### o, si son globales, TIPO-####): solo se pide el nombre. */
const nameOnly: FieldSpec[] = [{ name: 'name', label: 'Nombre', required: true, span: 2 }]
const autoCodeNote = (example: string) => `El código se asigna automáticamente al guardar (p. ej. ${example}) y no cambia.`
const activeField: FieldSpec = { name: 'is_active', label: 'Activo', type: 'checkbox', hideOnCreate: true }
const baseColumns: Column<Row>[] = [
  { key: 'code', label: 'Código', render: (r) => <span className="rounded-md bg-brand-500/10 px-2 py-0.5 font-mono text-xs font-medium text-gold ring-1 ring-brand-500/20">{String(r.code)}</span> },
  { key: 'name', label: 'Nombre' },
]
const CURRENCIES = [{ value: 'USD', label: 'Dólares ($)' }, { value: 'VES', label: 'Bolívares (Bs)' }]

export const StationsPage = () => (
  <CrudPage<Row>
    title="Estaciones" singular="estación" resource={stations} perm="catalog.station"
    columns={[{ ...baseColumns[0], label: 'Prefijo' }, baseColumns[1], { key: 'rif', label: 'RIF' }, { key: 'phone', label: 'Teléfono' }, activeColumn]}
    description="El prefijo de 3 letras identifica a la estación en el código de todos sus elementos (PLN-SU-0001)."
    fields={[
      { name: 'code', label: 'Prefijo', required: true, readOnlyOnEdit: true, uppercase: true, maxLength: 3, pattern: '[A-Za-z]{3}', placeholder: 'PLN',
        hint: '3 letras, sin números. No se puede cambiar después.' },
      { name: 'name', label: 'Nombre', required: true },
      { name: 'rif', label: 'RIF' }, { name: 'phone', label: 'Teléfono' }, { name: 'address', label: 'Dirección', span: 2 }, activeField,
    ]}
  />
)

export const FuelTypesPage = () => (
  <CrudPage<Row>
    title="Combustibles" singular="combustible" resource={fuelTypes} perm="catalog.fueltype"
    description={`${autoCodeNote('CB-0001')} Es un código global: los combustibles se comparten entre estaciones. En los gráficos, cada combustible recibe un color fijo de la paleta de la marca.`}
    columns={[...baseColumns, activeColumn]}
    fields={[...nameOnly, activeField]}
  />
)

export const IslandsPage = () => (
  <CrudPage<Row>
    title="Islas" singular="isla" resource={islands} perm="catalog.island" stationScoped
    description={autoCodeNote('PLN-IS-0001')}
    columns={[...baseColumns, activeColumn]} fields={[...nameOnly, activeField]}
  />
)

export const PumpsPage = () => (
  <CrudPage<Row>
    title="Surtidores" description={`Cada surtidor (manguera) tiene su totalizador de litros, su combustible y su tanque. ${autoCodeNote('PLN-SU-0001')}`}
    singular="surtidor" resource={pumps} perm="catalog.pump" stationScoped
    columns={[...baseColumns, { key: 'fuel_type_name', label: 'Combustible' }, { key: 'meter_max', label: 'Tope totalizador', numeric: true, render: (r) => (r.meter_max ? liters(r.meter_max) : '—') }, activeColumn]}
    fields={[
      ...nameOnly,
      { name: 'island', label: 'Isla', type: 'relation', resource: islands, stationScoped: true, required: true, readOnlyOnEdit: true },
      { name: 'fuel_type', label: 'Combustible', type: 'relation', resource: fuelTypes, required: true },
      { name: 'tank', label: 'Tanque', type: 'relation', resource: tanks, stationScoped: true },
      { name: 'meter_max', label: 'Tope del totalizador (L)', type: 'decimal', hint: 'Valor en que el contador vuelve a cero.' },
      activeField,
    ]}
  />
)

export const TanksPage = () => (
  <CrudPage<Row>
    title="Tanques" description={autoCodeNote('PLN-TQ-0001')} singular="tanque" resource={tanks} perm="inventory.tank" stationScoped
    columns={[
      ...baseColumns, { key: 'fuel_type_name', label: 'Combustible' },
      { key: 'capacity', label: 'Capacidad', numeric: true, render: (r) => liters(r.capacity) },
      { key: 'tolerance_pct', label: 'Tolerancia', numeric: true, render: (r) => `${Number(r.tolerance_pct)} %` },
      { key: 'calibration', label: 'Aforo', render: (r) => ((r.calibration as unknown[] | undefined)?.length ?? 0) >= 2 ? 'Configurado' : <span className="text-warning">Sin tabla</span> },
      { key: 'last_reading', label: 'Última medición', numeric: true, render: (r) => { const l = r.last_reading as { liters: string; height_cm: string | null } | null; return l ? <div>{liters(l.liters)}{l.height_cm !== null && <div className="text-muted text-xs">{Number(l.height_cm)} cm</div>}</div> : '—' } },
      activeColumn,
    ]}
    fields={[
      ...nameOnly,
      { name: 'fuel_type', label: 'Combustible', type: 'relation', resource: fuelTypes, required: true },
      { name: 'capacity', label: 'Capacidad (L)', type: 'decimal', required: true },
      { name: 'tolerance_pct', label: 'Tolerancia de diferencia (%)', type: 'decimal', required: true, hint: 'Diferencia aceptable entre lo esperado y lo medido.' },
      activeField,
    ]}
    defaults={{ tolerance_pct: '0.5' }}
  />
)

export const DenominationsPage = () => (
  <CrudPage<Row>
    title="Denominaciones" description="Billetes y monedas usados en el arqueo de efectivo." singular="denominación" resource={denominations} perm="catalog.denomination" searchable={false}
    columns={[
      { key: 'currency', label: 'Moneda' },
      { key: 'value', label: 'Valor', numeric: true, render: (r) => money(r.value, r.currency as 'USD' | 'VES') },
      { key: 'kind', label: 'Tipo', render: (r) => (r.kind === 'BILL' ? 'Billete' : 'Moneda') },
      activeColumn,
    ]}
    fields={[
      { name: 'currency', label: 'Moneda', type: 'select', options: CURRENCIES, required: true, readOnlyOnEdit: true },
      { name: 'value', label: 'Valor', type: 'decimal', required: true, readOnlyOnEdit: true },
      { name: 'kind', label: 'Tipo', type: 'select', options: [{ value: 'BILL', label: 'Billete' }, { value: 'COIN', label: 'Moneda' }], required: true },
      activeField,
    ]}
    defaults={{ kind: 'BILL' }}
  />
)

export const TerminalsPage = () => (
  <CrudPage<Row>
    title="Puntos de venta y BioPago" description={autoCodeNote('PLN-PV-0001 o PLN-BP-0001')} singular="terminal" resource={terminals} perm="catalog.paymentterminal" stationScoped
    columns={[...baseColumns, { key: 'kind', label: 'Tipo', render: (r) => (r.kind === 'POS' ? 'Punto de venta' : 'BioPago') }, { key: 'bank', label: 'Banco' }, { key: 'serial', label: 'Serial' }, activeColumn]}
    fields={[
      ...nameOnly,
      { name: 'kind', label: 'Tipo', type: 'select', options: [{ value: 'POS', label: 'Punto de venta' }, { value: 'BIOPAGO', label: 'BioPago' }], required: true, readOnlyOnEdit: true, hint: 'Define el código: PV para punto de venta, BP para BioPago.' },
      { name: 'currency', label: 'Moneda', type: 'select', options: CURRENCIES, required: true },
      { name: 'bank', label: 'Banco' },
      { name: 'serial', label: 'Serial' },
      activeField,
    ]}
    defaults={{ kind: 'POS', currency: 'VES' }}
  />
)

export const AttendantsPage = () => (
  <CrudPage<Row>
    title="Bomberos" description={`La cédula y el teléfono se almacenan cifrados. ${autoCodeNote('PLN-BO-0001')}`} singular="bombero" resource={attendants} perm="catalog.attendant" stationScoped
    columns={[...baseColumns, { key: 'national_id', label: 'Cédula' }, { key: 'phone', label: 'Teléfono' }, activeColumn]}
    fields={[...nameOnly, { name: 'national_id', label: 'Cédula' }, { name: 'phone', label: 'Teléfono' }, activeField]}
  />
)

export const ShiftTemplatesPage = () => (
  <CrudPage<Row>
    title="Turnos" description={autoCodeNote('PLN-TU-0001')} singular="turno" resource={shiftTemplates} perm="scheduling.shifttemplate" stationScoped
    columns={[...baseColumns, { key: 'start_time', label: 'Inicio' }, { key: 'end_time', label: 'Fin' }, activeColumn]}
    fields={[...nameOnly, { name: 'start_time', label: 'Inicio', type: 'time', required: true }, { name: 'end_time', label: 'Fin', type: 'time', required: true }, activeField]}
  />
)

export const FuelPricesPage = () => (
  <CrudPage<Row>
    title="Precios de combustible" description="Historial inmutable: un cambio de precio se registra como un precio nuevo con su fecha de vigencia."
    singular="precio" resource={fuelPrices} perm="catalog.fuelprice" stationScoped appendOnly searchable={false}
    columns={[
      { key: 'fuel_type_name', label: 'Combustible' },
      { key: 'price', label: 'Precio / L', numeric: true, render: (r) => money(r.price, r.currency as 'USD' | 'VES') },
      { key: 'valid_from', label: 'Vigente desde', render: (r) => dateTime(r.valid_from as string) },
    ]}
    fields={[
      { name: 'fuel_type', label: 'Combustible', type: 'relation', resource: fuelTypes, required: true },
      { name: 'price', label: 'Precio por litro', type: 'decimal', required: true },
      { name: 'currency', label: 'Moneda', type: 'select', options: CURRENCIES, required: true },
      { name: 'valid_from', label: 'Vigente desde', type: 'datetime', required: true },
    ]}
    defaults={() => ({ currency: 'USD', valid_from: nowLocal() })}
    fromForm={(v) => ({ ...v, valid_from: new Date(String(v.valid_from)).toISOString() })}
  />
)
