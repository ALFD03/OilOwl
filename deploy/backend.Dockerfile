# API de OilOwl (Django + gunicorn). Contexto de build: raíz del repo.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings

WORKDIR /app
COPY requirements.txt ./requirements.txt
COPY deploy/requirements.txt ./deploy/requirements.txt
RUN pip install -r deploy/requirements.txt

COPY backend/ ./backend/
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && useradd --system --uid 10001 --no-create-home oilowl

USER oilowl
WORKDIR /app/backend
EXPOSE 8000
ENTRYPOINT ["entrypoint.sh"]
CMD ["web"]
