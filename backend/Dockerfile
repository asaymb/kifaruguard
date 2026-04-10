FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

FROM base AS deps
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

FROM base AS runtime
ENV PYTHONPATH=/app
COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=deps /usr/local/bin /usr/local/bin
# Build context must be the **repo root** (not `backend/`) so `/app/backend/` exists for `import backend`.
COPY . /app
WORKDIR /app
CMD ["sh", "-c", "python scripts/wait_for_db.py && python scripts/seed_data.py && uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
