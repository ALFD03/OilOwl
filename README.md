# OilOwl

Control de lecturas, cierres de caja por isla e inventario para estaciones de servicio, con registros **inalterables** una vez bloqueados.

- **Backend:** Django 5 + DRF (`backend/`), Postgres en Supabase.
- **Frontend:** React + TypeScript + Tailwind (`frontend/`).
- **Despliegue:** un solo proyecto de Vercel. El frontend es estático y `/api/*` es una función Python (`api/index.py`).

## Flujo operativo

1. **Abrir jornada.** Se congela la tasa BCV del día. Una tasa manual exige el permiso `rates.override_rate`.
2. **Abrir isla.** Se registran las lecturas iniciales de cada surtidor. Si se dejan vacías, se toma la lectura final del cierre anterior y se avisa si hay discrepancias.
3. **Cierre.** Se cargan las lecturas finales y el arqueo: billetes Bs y $ por denominación, puntos de venta y BioPago (con lote). El servidor calcula litros, venta en $ y Bs, y el **sobrante o faltante en $, Bs y litros**.
4. **Enviar → Bloquear.** Al bloquear, el cierre se sella con HMAC-SHA256 encadenado al cierre anterior de la estación. Desde ese momento nadie puede modificarlo (ni la API, ni el ORM, ni SQL directo). Las correcciones se registran como *ajustes* append-only.
5. **Cerrar jornada.** Se concilian automáticamente los tanques con medición nueva: esperado = inicial + descargas − vendido, comparado con lo medido. La diferencia es la merma, en L/$/Bs, contra la tolerancia de cada tanque.

## Seguridad e integridad

| Capa | Implementación |
| --- | --- |
| Autenticación | Argon2, JWT de acceso de 10 min en memoria, refresh rotativo con lista negra en cookie `httpOnly; SameSite=Strict`, bloqueo tras N intentos fallidos |
| Autorización | Permisos por acción en cada endpoint (`ActionPermission`). Roles y usuarios dinámicos. Nadie puede otorgar permisos que no posee. Aislamiento por estación |
| Inalterabilidad | 1) guardas en los modelos; 2) triggers de Postgres (`closures/migrations/0002`); 3) cadena HMAC verificable (`GET /api/closures/verify-chain`) |
| Auditoría | `AuditLog` append-only (trigger) con usuario, IP, antes/después; los campos cifrados se ocultan |
| Cifrado | Cédula y teléfono de los bomberos con Fernet (rotación mediante `FIELD_ENCRYPTION_KEYS`), TLS hacia Postgres |
| Supabase | RLS activado sin políticas (deny-all) y privilegios revocados a `anon`/`authenticated`/`PUBLIC` en todo `public` (post-migrate): la API REST pública de Supabase no expone nada |
| Rate limits | Throttles de DRF (anónimo, usuario, escrituras, login por IP y por usuario) con caché compartida en Postgres o Redis (`CACHE_URL`) |

## Desarrollo local

Con `make` (ejecute `make` solo para ver todas las tareas):

```bash
make install     # venv del backend + dependencias del frontend (una vez)
make dev         # Postgres local + migraciones + API (:8017) + frontend (:5173), con recarga automática
make seed        # catálogo y roles sugeridos (base nueva)
make superuser
make check       # lint + tipos + pruebas, lo mismo que el CI
```

`make dev` siempre usa la base local (`oilowl_pg`), aunque la terminal tenga exportado un `DATABASE_URL` de producción o QA. Los puertos se cambian con `make dev BACKEND_PORT=8000 FRONTEND_PORT=3000`.

Paso a paso, sin `make`:

```bash
# Postgres local
docker run -d --name oilowl_pg -p 54329:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=oilowl postgres:17-alpine

# Backend
cd backend
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements-dev.txt
export DJANGO_DEBUG=true
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_catalog     # combustibles y denominaciones Bs/$
.venv/bin/python manage.py seed_roles       # roles sugeridos editables
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver 8000
.venv/bin/python -m pytest                  # pruebas (requieren Postgres por los triggers)

# Frontend
cd frontend
npm ci
API_TARGET=http://localhost:8000 npm run dev
npm test && npx tsc -b && npx oxlint src
```

Después de cambiar la API, regenere el contrato con `python manage.py spectacular --file openapi.yml` (en `backend/`) y luego `npm run gen:api` (en `frontend/`).

## Entornos (Vercel + Supabase)

| Entorno | Vercel | Supabase | Secretos locales |
| --- | --- | --- | --- |
| **Producción** | Despliegues de `main` (*production*) | `OilOwl` (`hmoacgzgbkxjqjllfjxv`), rol `postgres` | `.env.production.local` |
| **QA** | `develop` y PRs (*preview*) | `OilOwl-QA` (`ggftvymcrfvffvwfpkvc`), rol dedicado `oilowl_app` | `.env.qa.local` |

Cada entorno tiene su base de datos y **sus propias llaves**: un dato cifrado o un cierre de QA no es válido en producción, y viceversa. Los archivos `.env.*.local` no se versionan. **Respáldelos**: si se pierde `FIELD_ENCRYPTION_KEYS`, los datos cifrados de ese entorno son irrecuperables.

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Pooler de Supabase en modo transacción (puerto 6543) |
| `DJANGO_SECRET_KEY`, `JWT_SIGNING_KEY` | Llaves de firma |
| `FIELD_ENCRYPTION_KEYS` | Llaves Fernet separadas por coma (la primera cifra) |
| `HASH_CHAIN_KEY` | HMAC de la cadena de cierres. No debe cambiarse |
| `CRON_SECRET` | Protege `/api/cron/fetch-rate` (Vercel Cron, diario a las 07:00 VET) |
| `ALLOWED_HOSTS` | `.vercel.app` y dominios propios |
| `CACHE_URL` | Opcional: Redis para los rate limits |

Tareas administrativas, siempre desde una máquina de confianza y nunca durante el build:

```bash
./scripts/create-superuser.sh prod     # o: qa
# Migraciones (pooler en modo sesión, puerto 5432):
cd backend && set -a && . ../.env.qa.local && set +a
DATABASE_URL="${DATABASE_URL/:6543/:5432}" .venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_catalog && .venv/bin/python manage.py seed_roles   # datos base opcionales
```

Flujo recomendado: se prueba en QA (preview de `develop`) y, una vez validado, se fusiona a `main`. Las migraciones se aplican en QA primero y luego en producción.

## Nomenclatura de códigos

Todo elemento de una estación lleva un código `ESTACIÓN-TIPO-####`, asignado automáticamente al crearlo y fijo desde entonces (`apps/core/codes.py`):

| Tipo | Letras | Ejemplo |
| --- | --- | --- |
| Isla | `IS` | `PLN-IS-0001` |
| Surtidor | `SU` | `PLN-SU-0001` |
| Tanque | `TQ` | `PLN-TQ-0001` |
| Punto de venta | `PV` | `PLN-PV-0001` |
| BioPago | `BP` | `PLN-BP-0001` |
| Bombero | `BO` | `PLN-BO-0001` |
| Turno | `TU` | `PLN-TU-0001` |

- El prefijo de estación son 3 letras (A-Z) en mayúsculas, definidas al crearla y no editables.
- El número es correlativo por estación y tipo (`catalog.CodeSequence`, reservado con bloqueo de fila): nunca se reutiliza, ni al desactivar.
- No se puede mover un elemento a otra estación ni cambiar el tipo de un terminal, porque cambiaría su código.

## Identidad visual

Sistema **Night & Gold**: Azul Medianoche `#050A14` (fondo), Oro Bruñido `#C5A059` (marca y acentos), Gris Grafito `#808080` (texto secundario) y Blanco `#FFFFFF` (texto). Tipografías autoalojadas: **Bodoni Moda** para la marca y los titulares, **Inter** para la interfaz. Los tokens están en `frontend/src/index.css`; el modo oscuro es el predeterminado y el claro es opcional.

## Tasa BCV

Se obtiene de [DolarApi](https://ve.dolarapi.com) (`/v1/historicos/dolares/oficial/YYYY/MM/DD`). Los fines de semana y feriados no hay publicación, así que se toma la última disponible de los 7 días previos. Las tasas son históricas e inmutables.
