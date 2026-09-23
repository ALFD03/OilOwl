"""Endurece el esquema público de Supabase después de cada migración."""

import logging

from django.db import connection

logger = logging.getLogger(__name__)

HARDEN_SQL = """
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  -- Ninguna función de public se ejecuta vía la API REST de Supabase (/rest/v1/rpc).
  EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
  END IF;
END $$;
"""


def harden_public_schema(sender, **kwargs):
    if connection.vendor != "postgresql" or sender.name != "apps.core":
        return
    from django.core.management import call_command

    call_command("createcachetable", verbosity=0)
    with connection.cursor() as cursor:
        cursor.execute(HARDEN_SQL)
    logger.info("RLS activado y privilegios de anon/authenticated revocados en el esquema public")
