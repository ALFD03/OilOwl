/** Catálogos: todos construidos sobre el mismo CrudPage declarativo. */
import { stations, fuelTypes, islands, pumps, terminals, attendants, denominations, tanks, shiftTemplates, fuelPrices } from '../../api/resources'
import type { Column } from '../../components/data/DataTable'
import { activeColumn } from '../../components/data/columns'
import { CrudPage } from '../../components/data/CrudPage'
import type { FieldSpec } from '../../components/data/FormFields'
import { dateTime, liters, money, nowLocal } from '../../lib/format'

type Row = Record<string, unknown> & { id: string }

const codeName: FieldSpec[] = [
  { name: 'code', label: 'Código', required: true },
  { name: 'name', label: 'Nombre', required: true },
]
const activeField: FieldSpec = { name: 'is_active', label: 'Activo', type: 'checkbox', hideOnCreate: true }
const baseColumns: Column<Row>[] = [
  { key: 'code', label: 'Código' },
  { key: 'name', label: 'Nombre' },
]
const CURRENCIES = [{ value: 'USD', label: 'Dólares ($)' }, { value: 'VES', label: 'Bolívares (Bs)' }]

export const StationsPage = () => (
  <CrudPage<Row>
    title="Estaciones" singular="estación" resource={stations} perm="catalog.station"
    columns={[...baseColumns, { key: 'rif', label: 'RIF' }, { key: 'phone', label: 'Teléfono' }, activeColumn]}
    fields={[...codeName, { name: 'rif', label: 'RIF' }, { name: 'phone', label: 'Teléfono' }, { name: 'address', label: 'Dirección', span: 2 }, activeField]}
  />
)

export const FuelTypesPage = () => (
  <CrudPage<Row>
    title="Combustibles" singular="combustible" resource={fuelTypes} perm="catalog.fueltype"
    columns={[
      { key: 'color', label: '', render: (r) => <span className="inline-block size-3 rounded-full" style={{ background: String(r.color) }} /> },
      ...baseColumns, activeColumn,
    ]}
    fields={[...codeName, { name: 'color', label: 'Color', type: 'color' }, activeField]}
  />
)

export const IslandsPage = () => (
  <CrudPage<Row>
    title="Islas" singular="isla" resource={islands} perm="catalog.island" stationScoped
    columns={[...baseColumns, activeColumn]} fields={[...codeName, activeField]}
  />
)

export const PumpsPage = () => (
  <CrudPage<Row>
    title="Surtidores" description="Cada surtidor (manguera) tiene su totalizador de litros, su combustible y el tanque del que despacha."
    singular="surtidor" resource={pumps} perm="catalog.pump" stationScoped
    columns={[...baseColumns, { key: 'fuel_type_name', label: 'Combustible' }, { key: 'meter_max', label: 'Tope totalizador', numeric: true, render: (r) => (r.meter_max ? liters(r.meter_max) : '—') }, activeColumn]}
    fields={[
      ...codeName,
      { name: 'island', label: 'Isla', type: 'relation', resource: islands, stationScoped: true, required: true },
      { name: 'fuel_type', label: 'Combustible', type: 'relation', resource: fuelTypes, required: true },
      { name: 'tank', label: 'Tanque', type: 'relation', resource: tanks, stationScoped: true },
      { name: 'meter_max', label: 'Tope del totalizador (L)', type: 'decimal', hint: 'Valor en que el contador vuelve a cero.' },
      activeField,
    ]}
  />
)

export const TanksPage = () => (
  <CrudPage<Row>
    title="Tanques" singular="tanque" resource={tanks} perm="inventory.tank" stationScoped
    columns={[
      ...baseColumns, { key: 'fuel_type_name', label: 'Combustible' },
      { key: 'capacity', label: 'Capacidad', numeric: true, render: (r) => liters(r.capacity) },
      { key: 'tolerance_pct', label: 'Tolerancia', numeric: true, render: (r) => `${Number(r.tolerance_pct)} %` },
      { key: 'last_reading', label: 'Última medición', numeric: true, render: (r) => { const l = r.last_reading as { liters: string } | null; return l ? liters(l.liters) : '—' } },
      activeColumn,
    ]}
    fields={[
      ...codeName,
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
    title="Puntos de venta y BioPago" singular="terminal" resource={terminals} perm="catalog.paymentterminal" stationScoped
    columns={[...baseColumns, { key: 'kind', label: 'Tipo', render: (r) => (r.kind === 'POS' ? 'Punto de venta' : 'BioPago') }, { key: 'bank', label: 'Banco' }, { key: 'serial', label: 'Serial' }, activeColumn]}
    fields={[
      ...codeName,
      { name: 'kind', label: 'Tipo', type: 'select', options: [{ value: 'POS', label: 'Punto de venta' }, { value: 'BIOPAGO', label: 'BioPago' }], required: true },
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
    title="Bomberos" description="La cédula y el teléfono se almacenan cifrados." singular="bombero" resource={attendants} perm="catalog.attendant" stationScoped
    columns={[...baseColumns, { key: 'national_id', label: 'Cédula' }, { key: 'phone', label: 'Teléfono' }, activeColumn]}
    fields={[...codeName, { name: 'national_id', label: 'Cédula' }, { name: 'phone', label: 'Teléfono' }, activeField]}
  />
)

export const ShiftTemplatesPage = () => (
  <CrudPage<Row>
    title="Turnos" singular="turno" resource={shiftTemplates} perm="scheduling.shifttemplate" stationScoped
    columns={[...baseColumns, { key: 'start_time', label: 'Inicio' }, { key: 'end_time', label: 'Fin' }, activeColumn]}
    fields={[...codeName, { name: 'start_time', label: 'Inicio', type: 'time', required: true }, { name: 'end_time', label: 'Fin', type: 'time', required: true }, activeField]}
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
