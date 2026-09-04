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

# The UI ships separately (Next.js on Cloudflare) — this container is the
# API only. main.py's static-file mount is a no-op when backend/app/static
# doesn't exist, so nothing else needs to change.

# Cloud Run injects PORT. Keep-alive is generous because the progress stream is
# a long-lived SSE connection.
CMD exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 75
