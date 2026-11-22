# Biʼire — one image serves the React UI and the FastAPI backend.

FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend /src/frontend/dist /app/frontend/dist

ENV FRONTEND_DIST=/app/frontend/dist \
    DB_PATH=/app/data/lissannote.db \
    DEMO_MODE=0 \
    BUILD_ID=2026-11-22a \
    PYTHONUNBUFFERED=1

RUN mkdir -p /app/data
WORKDIR /app/backend
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
