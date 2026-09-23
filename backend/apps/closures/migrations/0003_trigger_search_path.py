"""Fija el search_path de las funciones de integridad (recomendación del linter de Supabase)."""

from django.db import migrations

FUNCTIONS = ["oilowl_block_locked_status()", "oilowl_block_locked_child()", "oilowl_append_only()"]


class Migration(migrations.Migration):
    dependencies = [("closures", "0002_integrity_triggers")]

    operations = [
        migrations.RunSQL(
            "\n".join(f"ALTER FUNCTION {fn} SET search_path = public, pg_temp;" for fn in FUNCTIONS),
            "\n".join(f"ALTER FUNCTION {fn} RESET search_path;" for fn in FUNCTIONS),
        )
    ]
