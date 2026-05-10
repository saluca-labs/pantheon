# ── Stage 1: build / install ──────────────────────────────────────────────────
FROM python:3.11-slim AS builder
WORKDIR /repo

RUN pip install --upgrade pip uv

COPY apps/platform-api/pyproject.toml ./apps/platform-api/
COPY apps/platform-api/requirements.txt ./apps/platform-api/
COPY packages/auth/python/ ./packages/auth/python/
COPY packages/config/python/ ./packages/config/python/
COPY packages/observability/python/ ./packages/observability/python/
COPY packages/memory-client/python/ ./packages/memory-client/python/
COPY packages/secrets/python/ ./packages/secrets/python/
COPY packages/database/ ./packages/database/

# Install into a virtual env so we can copy it cleanly.
# Runtime deps (uvicorn, fastapi, sqlalchemy, etc.) live in requirements.txt;
# pyproject.toml dependencies = [] by design (see header comment in that file).
RUN uv venv /app/venv && \
    . /app/venv/bin/activate && \
    uv pip install -r ./apps/platform-api/requirements.txt && \
    uv pip install ./packages/auth/python[dev] && \
    uv pip install ./packages/config/python && \
    uv pip install ./packages/observability/python && \
    uv pip install ./packages/memory-client/python && \
    uv pip install ./packages/secrets/python && \
    uv pip install ./packages/database

COPY apps/platform-api/ ./apps/platform-api/
RUN . /app/venv/bin/activate && \
    uv pip install ./apps/platform-api

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runner
WORKDIR /app

RUN groupadd --gid 1001 platform && \
    useradd --uid 1001 --gid 1001 --no-create-home platform

COPY --from=builder /app/venv /app/venv
COPY --from=builder /repo/apps/platform-api /app/apps/platform-api
# packages/database is included so the migrate-job's stage-1 (local-auth tree)
# can `cd /app/packages/database && alembic upgrade head` from the soulauth image.
COPY --from=builder /repo/packages/database /app/packages/database

ENV PATH="/app/venv/bin:$PATH"
ENV PYTHONPATH="/app/apps/platform-api"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

USER platform
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live')" || exit 1

# Single worker by default to avoid concurrent schema-creation races on
# first boot (init_db() in lifespan would race across workers and trigger
# UniqueViolationError on pg_type_typname_nsp_index). Override with
# UVICORN_WORKERS env / compose `command:` in production once schema is
# managed exclusively by Alembic.
CMD ["/app/venv/bin/uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
