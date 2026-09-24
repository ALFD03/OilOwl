# OilOwl — tareas de desarrollo local.  Ejecute `make` para ver la ayuda.
#
# Todo apunta a la base LOCAL (docker `oilowl_pg`, puerto 54329). Las variables se fijan aquí
# para que un DATABASE_URL de producción o QA exportado en la terminal no se use por accidente.

BACKEND_PORT  ?= 8017
FRONTEND_PORT ?= 5173
PG_CONTAINER  ?= oilowl_pg
PG_PORT       ?= 54329
PG_IMAGE      ?= postgres:17-alpine

export DJANGO_DEBUG := true
export DATABASE_URL := postgres://postgres:postgres@localhost:$(PG_PORT)/oilowl
export BACKEND_PORT FRONTEND_PORT
unexport POSTGRES_URL POSTGRES_URL_NON_POOLING CACHE_URL

VENV   := backend/.venv
PYTHON := $(CURDIR)/$(VENV)/bin/python
MANAGE := cd backend && $(PYTHON) manage.py

.DEFAULT_GOAL := help
.PHONY: help install dev api web db db-stop db-shell migrate migrations seed superuser shell \
        _deps test test-back test-front lint format typecheck check schema build

help: ## Muestra esta ayuda
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- Arranque ---------------------------------------------------------------

install: ## Crea el venv del backend e instala dependencias (backend + frontend)
	@test -x $(PYTHON) || uv venv --python 3.12 $(VENV)
	uv pip install --python $(PYTHON) -r backend/requirements-dev.txt
	cd frontend && npm ci

dev: _deps db migrate ## Levanta API + frontend con recarga automática (Ctrl+C detiene todo)
	@scripts/dev.sh all

api: _deps db ## Solo la API (Django runserver)
	@scripts/dev.sh api

web: ## Solo el frontend (Vite); la API se espera en BACKEND_PORT
	@scripts/dev.sh web

_deps:
	@test -x $(PYTHON) || { echo "Falta el entorno del backend: ejecute 'make install'"; exit 1; }
	@test -d frontend/node_modules || { echo "Faltan dependencias del frontend: ejecute 'make install'"; exit 1; }

# --- Base de datos local ----------------------------------------------------

db: ## Inicia (o crea) el Postgres local en Docker
	@if docker container inspect $(PG_CONTAINER) >/dev/null 2>&1; then \
		docker start $(PG_CONTAINER) >/dev/null; \
	else \
		echo "Creando $(PG_CONTAINER)…"; \
		docker run -d --name $(PG_CONTAINER) -p $(PG_PORT):5432 \
			-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=oilowl $(PG_IMAGE) >/dev/null; \
	fi
	@until docker exec $(PG_CONTAINER) pg_isready -U postgres -q; do sleep 0.5; done
	@echo "Postgres local listo en localhost:$(PG_PORT)"

db-stop: ## Detiene el Postgres local
	docker stop $(PG_CONTAINER)

db-shell: ## Abre psql en la base local
	docker exec -it $(PG_CONTAINER) psql -U postgres -d oilowl

migrate: ## Aplica migraciones en la base local
	@$(MANAGE) migrate

migrations: ## Genera migraciones nuevas a partir de los modelos
	$(MANAGE) makemigrations

seed: ## Carga catálogo (combustibles, denominaciones) y roles sugeridos
	$(MANAGE) seed_catalog
	$(MANAGE) seed_roles

superuser: ## Crea un superusuario local
	$(MANAGE) createsuperuser

shell: ## Shell de Django
	$(MANAGE) shell

# --- Calidad (lo mismo que corre el CI) -------------------------------------

test: test-back test-front ## Todas las pruebas

test-back: db ## Pruebas del backend (pytest)
	cd backend && $(PYTHON) -m pytest

test-front: ## Pruebas del frontend (vitest)
	cd frontend && npm test

lint: ## ruff + oxlint
	cd backend && $(PYTHON) -m ruff check . && $(PYTHON) -m ruff format --check .
	cd frontend && npx oxlint src

format: ## Formatea el backend con ruff
	cd backend && $(PYTHON) -m ruff check --fix . && $(PYTHON) -m ruff format .

typecheck: ## Verifica tipos del frontend
	cd frontend && npx tsc -b

check: lint typecheck test ## Todo lo del CI antes de hacer push

schema: ## Regenera openapi.yml y los tipos del frontend tras cambiar la API
	$(MANAGE) spectacular --file openapi.yml
	cd frontend && npm run gen:api

build: ## Build de producción del frontend
	cd frontend && npm run build
