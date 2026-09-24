#!/usr/bin/env bash
# Punto de entrada del contenedor backend.
#   web              gunicorn (por defecto)
#   migrate          migraciones por el pooler en modo sesión (puerto 5432)
#   seed             combustibles, denominaciones y roles sugeridos
#   healthcheck      comprueba que gunicorn responde
#   <otro>           se pasa a manage.py (p. ej. createsuperuser)
set -euo pipefail

# Una llave vacía en .env no cae al valor por defecto de settings.py: rompería la cadena HMAC
# de los cierres o el descifrado. Mejor no arrancar.
for key in DATABASE_URL DJANGO_SECRET_KEY JWT_SIGNING_KEY FIELD_ENCRYPTION_KEYS HASH_CHAIN_KEY; do
  if [[ -z "${!key:-}" ]]; then
    echo "Falta $key en deploy/.env" >&2
    exit 1
  fi
done

case "${1:-web}" in
  web)
    exec gunicorn config.wsgi:application \
      --bind 0.0.0.0:8000 \
      --workers "${GUNICORN_WORKERS:-3}" \
      --timeout "${GUNICORN_TIMEOUT:-30}" \
      --access-logfile - \
      --error-logfile -
    ;;
  migrate)
    # El modo transacción (6543) no admite todo lo que hace migrate: se usa el modo sesión.
    export DATABASE_URL="${DATABASE_URL_MIGRATIONS:-${DATABASE_URL/:6543/:5432}}"
    exec python manage.py migrate --noinput
    ;;
  seed)
    python manage.py seed_catalog
    exec python manage.py seed_roles
    ;;
  healthcheck)
    # Cualquier respuesta < 500 (p. ej. 401 sin token) significa que la app está viva.
    exec python - <<'EOF'
import sys, urllib.error, urllib.request
req = urllib.request.Request(
    "http://127.0.0.1:8000/api/auth/me",
    headers={"Host": "localhost", "X-Forwarded-Proto": "https"},
)
try:
    urllib.request.urlopen(req, timeout=5)
except urllib.error.HTTPError as exc:
    sys.exit(0 if exc.code < 500 else 1)
except Exception:
    sys.exit(1)
EOF
    ;;
  *)
    exec python manage.py "$@"
    ;;
esac
