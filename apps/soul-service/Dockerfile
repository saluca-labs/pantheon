# apps/soul-service/Dockerfile — Pantheon container for the Soul memory service.
#
# Vendored from github.com/salucallc/soul (Apache 2.0). The upstream
# Dockerfile lives next to this one as `Dockerfile.upstream` for
# reference, but it COPYs `../gcp_config.py` from outside its build context
# (which only works in upstream's own checkout). This Pantheon-built
# variant fixes that: build context is apps/soul-service/, no host-coupled
# project defaults, non-root user, /health/live + /health/ready surfaces.
#
# Build (from repo root):
#   docker build -f apps/soul-service/Dockerfile -t soul-service:dev apps/soul-service/
#
# CD: matrix entry in .github/workflows/cd.yml with
#       dockerfile: apps/soul-service/Dockerfile
#       context:    apps/soul-service

# ── Stage 1: install dependencies into a virtualenv ───────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

RUN pip install --no-cache-dir --upgrade pip uv

# Pin runtime deps explicitly so the image is reproducible. Versions match
# the upstream Dockerfile so we stay bug-compatible with the soul-memory
# PyPI release. The google-cloud-* libraries are optional (the
# gcp_config.py module falls back to env vars when Secret Manager is
# unreachable — see Z:/soul/gcp_config.py:36), but we install them so
# Pantheon's GKE deployment can opt into Secret Manager later without a
# rebuild.
RUN uv venv /app/venv && \
    . /app/venv/bin/activate && \
    uv pip install --no-cache \
        anthropic==0.40.0 \
        supabase==2.10.0 \
        google-cloud-secret-manager==2.20.0 \
        fastapi==0.115.0 \
        "uvicorn[standard]==0.32.0" \
        pydantic>=2.0.0

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Non-root user matches the rest of the Pantheon namespace (uid 1000 is the
# convention used by memory-service-deployment.yaml).
RUN groupadd --gid 1000 soul && \
    useradd --uid 1000 --gid 1000 --no-create-home --shell /bin/false soul && \
    mkdir -p /app/data && chown -R soul:soul /app

COPY --from=builder /app/venv /app/venv

# Layout: the vendored `soul/` package lives next to our pantheon wrapper.
# pantheon_entry.py adds its own directory to sys.path so `from soul import
# storage` resolves without an editable install or PYTHONPATH gymnastics.
COPY --chown=soul:soul soul/ /app/soul/
COPY --chown=soul:soul pantheon_entry.py /app/pantheon_entry.py

ENV PATH="/app/venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Tier 0 SQLite buffer goes under /app/data so the runtime user can write
# without a privileged writable filesystem (the deployment sets
# readOnlyRootFilesystem: true and mounts an emptyDir over /app/data).
ENV SOUL_BUFFER_PATH=/app/data/active_kb.db
ENV PORT=8080
ENV SOUL_ENV=production

USER soul
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health/live')" || exit 1

CMD ["uvicorn", "pantheon_entry:app", "--host", "0.0.0.0", "--port", "8080"]
