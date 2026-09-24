#!/bin/sh
# crond no hereda el entorno del contenedor: se guarda lo necesario para el job.
set -eu
: "${CRON_SECRET:?CRON_SECRET es obligatorio}"
: "${APP_DOMAIN:?APP_DOMAIN es obligatorio}"
umask 077
printf 'CRON_SECRET=%s\nAPP_DOMAIN=%s\n' "$CRON_SECRET" "$APP_DOMAIN" > /run/cron.env
exec crond -f -L /dev/stdout
