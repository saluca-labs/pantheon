# ── Stage 1: build / install ──────────────────────────────────────────────────
FROM python:3.11-slim AS builder
WORKDIR /repo

RUN pip install --upgrade pip uv

COPY apps/platform-api/pyproject.toml ./apps/platform-api/
COPY packages/auth/python/ ./packages/auth/python/
COPY packages/config/python/ ./packages/config/python/
COPY packages/observability/python/ ./packages/observability/python/

# Install into a virtual env so we can copy it cleanly
RUN uv venv /app/venv && \
    . /app/venv/bin/activate && \
    uv pip install -e ./packages/auth/python[dev] && \
    uv pip install -e ./packages/config/python && \
    uv pip install -e ./packages/observability/python

COPY apps/platform-api/ ./apps/platform-api/
RUN . /app/venv/bin/activate && \
    uv pip install -e ./apps/platform-api

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runner
WORKDIR /app

RUN groupadd --gid 1001 platform && \
    useradd --uid 1001 --gid 1001 --no-create-home platform

COPY --from=builder /app/venv /app/venv
COPY --from=builder /repo/apps/platform-api /app/apps/platform-api

ENV PATH="/app/venv/bin:$PATH"
ENV PYTHONPATH="/app/apps/platform-api"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

USER platform
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live')" || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
