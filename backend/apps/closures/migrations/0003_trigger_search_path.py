"""Fija el search_path de las funciones de integridad (recomendación del linter de Supabase).

Se fija al esquema donde corre la migración (public en producción, qa en QA) para que los
triggers de un esquema nunca consulten las tablas de otro.
"""

from django.db import migrations

FUNCTIONS = ["oilowl_block_locked_status()", "oilowl_block_locked_child()", "oilowl_append_only()"]

FORWARD = "DO $$ BEGIN\n{}\nEND $$;".format(
    "\n".join(
        f"  EXECUTE format('ALTER FUNCTION {fn} SET search_path = %I, pg_temp', current_schema());"
        for fn in FUNCTIONS
    )
)


class Migration(migrations.Migration):
    dependencies = [("closures", "0002_integrity_triggers")]

    operations = [
        migrations.RunSQL(
            FORWARD,
            "\n".join(f"ALTER FUNCTION {fn} RESET search_path;" for fn in FUNCTIONS),
        )
    ]
