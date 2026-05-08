# ──────────────────────────────────────────────────────────────────────────────
# Tiresias Matrix appservice — multi-stage Python 3.11 image
#
# Apache 2.0.
#
# Stage 1 (deps): install runtime dependencies into a clean prefix.
# Stage 2 (runtime): copy prefix + source into a slim image, run as uid 1001.
# ──────────────────────────────────────────────────────────────────────────────

ARG PYTHON_VERSION=3.11

# ── deps ────────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS deps

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

COPY pyproject.toml ./
COPY src ./src

# Install into a relocatable prefix so we can copy it into the runtime stage.
RUN pip install --prefix=/install .

# ── runtime ─────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Non-root user.
RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid 1001 --home-dir /app --shell /sbin/nologin app

COPY --from=deps /install /usr/local
COPY --chown=app:app src /app/src

WORKDIR /app
USER app

EXPOSE 8080

# Health probe target — see main.create_app /healthz.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/healthz')" || exit 1

ENV PYTHONPATH=/app/src

CMD ["uvicorn", "matrix_bridge.main:app", "--host", "0.0.0.0", "--port", "8080"]
