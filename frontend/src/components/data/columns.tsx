import { Badge } from '../ui/Badge'
import type { Column } from './DataTable'

type Row = Record<string, unknown>

export const activeColumn: Column<Row> = {
  key: 'is_active',
  label: 'Estado',
  render: (row) => (row.is_active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>),
}
