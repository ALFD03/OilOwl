#!/usr/bin/env bash
# Crea un superusuario en PRODUCCIÓN o en QA (Supabase).
# Uso (desde la raíz del repo):  ./scripts/create-superuser.sh [prod|qa]   (por defecto: prod)
# Requiere .env.production.local / .env.qa.local (no versionados) y el entorno virtual de backend/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "${1:-prod}" in
  prod) ENV_FILE="$ROOT/.env.production.local" ;;
  qa) ENV_FILE="$ROOT/.env.qa.local" ;;
  *) echo "Uso: $0 [prod|qa]" >&2; exit 1 ;;
esac
PYTHON="$ROOT/backend/.venv/bin/python"

[[ -f "$ENV_FILE" ]] || { echo "Falta $ENV_FILE" >&2; exit 1; }
[[ -x "$PYTHON" ]] || { echo "Falta el entorno virtual: cd backend && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL vacío en $ENV_FILE" >&2; exit 1; }

# Las tareas administrativas van por el pooler en modo sesión (5432), no por el de transacción (6543).
export DATABASE_URL="${DATABASE_URL/:6543/:5432}"

cd "$ROOT/backend"
echo "Entorno: ${1:-prod} · Base de datos: ${DATABASE_URL##*@}"
"$PYTHON" manage.py migrate --check >/dev/null || { echo "Hay migraciones pendientes; ejecute primero: manage.py migrate" >&2; exit 1; }
"$PYTHON" manage.py createsuperuser
echo "Listo. Ingrese en la aplicación con ese usuario; las contraseñas deben tener al menos 10 caracteres."
