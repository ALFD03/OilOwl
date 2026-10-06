# Despliegue en VPS (Docker Compose + Supabase)

Alternativa a Vercel, guardada en la rama aislada `deploy/vps`. Vercel no despliega esta rama
(`git.deploymentEnabled` en `vercel.json`). La base de datos sigue en Supabase y no se migra nada.

```
Internet ──► web (Caddy :80/:443, HTTPS automático)
              ├── /api/*  ──► backend (gunicorn + Django) ──► Supabase (pooler, TLS)
              └── /*      ──► frontend compilado (SPA)
cron (diario 04:00 VET) ──► backend /api/cron/fetch-rate
```

| Archivo | Reemplaza a |
| --- | --- |
| `backend.Dockerfile`, `entrypoint.sh` | `api/index.py` (función Python de Vercel) |
| `web.Dockerfile`, `Caddyfile` | build estático, rewrites y cabeceras de `vercel.json` |
| `cron/` | `crons` de `vercel.json` |
| `.env` (desde `.env.example`) | variables de entorno del proyecto de Vercel |

## Requisitos de la VPS

- Ubuntu/Debian con Docker Engine y el plugin Compose.
- **Región cercana a Supabase (Canadá Central, Montreal)**: Toronto, Montreal o la costa este de EE. UU.
  Cada consulta viaja por Internet; una VPS lejana hace lenta la app.
- IPv4 pública fija y un dominio con un registro **A** apuntando a ella.
- Firewall: solo 22, 80 y 443 (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`).

## Primer despliegue

```bash
git clone -b deploy/vps git@github.com:ALFD03/OilOwl.git && cd OilOwl
git merge origin/main                 # traer lo último de producción (ver "Mantener la rama")
cd deploy
cp .env.example .env && chmod 600 .env
nano .env                             # dominio + las MISMAS llaves y DATABASE_URL del entorno
docker compose build
docker compose run --rm backend migrate   # idempotente; no hace nada si Supabase ya está al día
docker compose up -d
docker compose ps                     # backend debe quedar "healthy"
```

Luego:

1. Probar `https://<dominio>` e iniciar sesión.
2. Probar el cron a mano: `docker compose exec cron fetch-rate.sh` debe responder `{"ok": true, ...}`.
3. Opcional: en Supabase → *Database → Network restrictions*, permitir solo la IP de la VPS
   (y la de su equipo si ejecuta tareas administrativas).
4. Cuando todo funcione, apagar Vercel para ese entorno (pausar el proyecto o quitar el dominio),
   así el cron no corre dos veces. Correr dos veces no daña datos (la tasa del día es única), pero es innecesario.

## Operación

```bash
cd deploy
docker compose logs -f backend               # logs de la API (también: web, cron)
docker compose run --rm backend migrate      # migraciones (modo sesión, puerto 5432)
docker compose run --rm backend seed         # catálogo y roles sugeridos (solo en una base vacía)
docker compose run --rm backend createsuperuser
docker compose restart backend
```

### Actualizar

```bash
cd OilOwl && git pull
cd deploy && docker compose build
docker compose run --rm backend migrate      # si la versión trae migraciones
docker compose up -d
docker image prune -f
```

Se mantiene la regla de siempre: las migraciones se aplican primero en QA y en producción solo
cuando el código correspondiente ya está en `main`.

### Respaldos

El plan gratuito de Supabase no tiene restauración a un punto en el tiempo. Un respaldo diario desde la VPS:

```bash
# crontab -e   (usa el pooler en modo sesión y un contenedor con el cliente de Postgres 17)
0 4 * * * docker run --rm --env-file /ruta/OilOwl/deploy/.env -v /srv/backups:/b postgres:17-alpine \
  sh -c 'pg_dump "${DATABASE_URL/:6543/:5432}" -n public --no-owner --no-acl -Fc -f /b/oilowl-$(date +\%F).dump' \
  && find /srv/backups -name 'oilowl-*.dump' -mtime +14 -delete
```

Copie `/srv/backups` fuera de la VPS (rclone a S3/Backblaze/Drive). Un respaldo en el mismo servidor no es respaldo.

## Mantener la rama

La rama `deploy/vps` solo añade `deploy/`, `.dockerignore`, una variable (`DB_CONN_MAX_AGE`) en
`backend/config/settings.py` y la exclusión en `vercel.json`. Para ponerla al día con producción:

```bash
git switch deploy/vps && git merge origin/main && git push
```

No haga merge de `deploy/vps` hacia `develop`/`main` salvo que decida migrar de forma definitiva.

## Entorno QA

Mismo procedimiento en otra VPS (o la misma con otro directorio y puertos) usando las llaves y la
`DATABASE_URL` de `.env.qa.local` y un subdominio como `qa.<dominio>`. Dos instancias en la misma
máquina no pueden compartir los puertos 80/443: en ese caso hace falta un solo Caddy delante de ambas.

## Prueba local

```bash
cd deploy
# .env con APP_DOMAIN=localhost; Caddy usa entonces su propia CA local en lugar de Let's Encrypt.
docker compose up -d --build && curl -k https://localhost/
```
