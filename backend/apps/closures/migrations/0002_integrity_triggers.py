"""Segunda capa de inalterabilidad: la base de datos rechaza cambios sobre registros bloqueados.

Aunque alguien se salte la aplicación (SQL directo, consola de Supabase, ORM con .update()),
estos triggers impiden modificar o borrar cierres bloqueados y registros append-only.
"""

from django.db import migrations

STATUS_TABLES = ["closures_closure", "operations_shift"]
CHILD_TABLES = ["closures_meterreading", "closures_closureline"]
APPEND_ONLY_TABLES = [
    "audit_auditlog",
    "closures_closureadjustment",
    "inventory_tankreading",
    "inventory_delivery",
    "inventory_reconciliation",
    "catalog_fuelprice",
    "rates_exchangerate",
]

FUNCTIONS = """
CREATE OR REPLACE FUNCTION oilowl_block_locked_status() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'LOCKED' THEN
    RAISE EXCEPTION 'OILOWL_IMMUTABLE: %.% está bloqueado', TG_TABLE_NAME, OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION oilowl_block_locked_child() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM closures_closure WHERE id = NEW.closure_id AND status = 'LOCKED') THEN
      RAISE EXCEPTION 'OILOWL_IMMUTABLE: el cierre % está bloqueado', NEW.closure_id;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.is_locked THEN
    RAISE EXCEPTION 'OILOWL_IMMUTABLE: %.% está bloqueado', TG_TABLE_NAME, OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION oilowl_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OILOWL_IMMUTABLE: % es de solo inserción', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
"""


def forward_sql():
    statements = [FUNCTIONS]
    for table in STATUS_TABLES:
        statements.append(
            f"CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION oilowl_block_locked_status();"
        )
    for table in CHILD_TABLES:
        statements.append(
            f"CREATE TRIGGER {table}_immutable BEFORE INSERT OR UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION oilowl_block_locked_child();"
        )
    for table in APPEND_ONLY_TABLES:
        statements.append(
            f"CREATE TRIGGER {table}_append_only BEFORE UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION oilowl_append_only();"
        )
    return "\n".join(statements)


def reverse_sql():
    statements = []
    for table in STATUS_TABLES + CHILD_TABLES:
        statements.append(f"DROP TRIGGER IF EXISTS {table}_immutable ON {table};")
    for table in APPEND_ONLY_TABLES:
        statements.append(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table};")
    statements.append(
        "DROP FUNCTION IF EXISTS oilowl_block_locked_status(); "
        "DROP FUNCTION IF EXISTS oilowl_block_locked_child(); "
        "DROP FUNCTION IF EXISTS oilowl_append_only();"
    )
    return "\n".join(statements)


class Migration(migrations.Migration):
    dependencies = [
        ("closures", "0001_initial"),
        ("operations", "0001_initial"),
        ("audit", "0001_initial"),
        ("inventory", "0001_initial"),
        ("catalog", "0001_initial"),
        ("rates", "0001_initial"),
    ]

    operations = [migrations.RunSQL(forward_sql(), reverse_sql())]
