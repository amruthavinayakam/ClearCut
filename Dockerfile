# --- stage 1: build the UI -------------------------------------------------
FROM node:20-slim AS ui

WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Vite writes to ../backend/app/static, which resolves to /backend/app/static
# inside this stage; copied out below.
RUN npm run build


# --- stage 2: runtime ------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

# DejaVu is the font the demo-asset generator falls back to; without it the
# generated rough cut renders with PIL's bitmap font.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY tools/ ./tools/
COPY --from=ui /backend/app/static ./backend/app/static

# Cloud Run injects PORT. Keep-alive is generous because the progress stream is
# a long-lived SSE connection.
CMD exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 75
