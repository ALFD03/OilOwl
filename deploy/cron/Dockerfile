# Reemplaza a Vercel Cron: consulta diaria de la tasa BCV contra el backend por la red interna.
FROM alpine:3.22
RUN apk add --no-cache curl
COPY crontab /etc/crontabs/root
COPY fetch-rate.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/fetch-rate.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
