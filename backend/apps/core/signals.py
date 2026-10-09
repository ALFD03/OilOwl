"""Endurece el esquema de la aplicación (public en producción, qa en QA) después de cada migración."""

import logging

from django.db import connection

logger = logging.getLogger(__name__)

HARDEN_SQL = """
DO $$
DECLARE
  s text := current_schema();
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = s AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t.tablename);
  END LOOP;
  -- Ninguna función del esquema se ejecuta vía la API REST de Supabase (/rest/v1/rpc).
  EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM PUBLIC', s);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', s);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', s);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM anon', s);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', s);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM authenticated', s);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM authenticated', s);
  END IF;
END $$;
"""


def harden_schema(sender, **kwargs):
    if connection.vendor != "postgresql" or sender.name != "apps.core":
        return
    from django.core.management import call_command

    call_command("createcachetable", verbosity=0)
    with connection.cursor() as cursor:
        cursor.execute(HARDEN_SQL)
    logger.info("RLS activado y privilegios de anon/authenticated revocados en el esquema de la aplicación")
