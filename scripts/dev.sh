#!/usr/bin/env bash
# Levanta la API (Django, recarga automática) y el frontend (Vite, HMR) a la vez.
# Uso: scripts/dev.sh [api|web|all]   (lo invoca `make dev`, `make api` y `make web`)
# Ctrl+C detiene ambos procesos con todos sus hijos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8017}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PYTHON="$ROOT/backend/.venv/bin/python"
MODE="${1:-all}"

pids=()

cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# Cada servicio corre en su propia sesión (setsid) para poder matar su árbol completo
# (el autoreloader de Django y el esbuild de Vite crean procesos hijos).
run() {
  local prefix="$1" dir="$2"
  shift 2
  setsid bash -c 'prefix="$1"; cd "$2" && shift 2 && "$@" 2>&1 | sed -u "s/^/$prefix/"' _ "$prefix" "$dir" "$@" &
  pids+=("$!")
}

start_api() {
  run $'\e[36m[api]\e[0m ' "$ROOT/backend" \
    "$PYTHON" manage.py runserver "127.0.0.1:$BACKEND_PORT" --force-color
}

start_web() {
  run $'\e[35m[web]\e[0m ' "$ROOT/frontend" \
    env API_TARGET="http://localhost:$BACKEND_PORT" FORCE_COLOR=1 node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort
}

case "$MODE" in
  api) start_api ;;
  web) start_web ;;
  all) start_api; start_web ;;
  *) echo "Uso: $0 [api|web|all]" >&2; exit 1 ;;
esac

[[ "$MODE" != api ]] && echo -e "\n  App:  \e[1mhttp://localhost:$FRONTEND_PORT\e[0m"
[[ "$MODE" != web ]] && echo -e "  API:  \e[1mhttp://localhost:$BACKEND_PORT/api/\e[0m"
echo -e "  Ctrl+C para detener\n"

# Si uno de los dos se cae, se detiene todo.
wait -n
