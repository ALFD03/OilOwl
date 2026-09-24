#!/bin/sh
# Llama a /api/cron/fetch-rate como lo hacía Vercel Cron (GET + Bearer).
set -eu
. /run/cron.env
curl -fsS --max-time 60 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Host: ${APP_DOMAIN}" \
  -H "X-Forwarded-Proto: https" \
  http://backend:8000/api/cron/fetch-rate
echo
