# ---------- builder ----------
FROM python:3.12-slim AS builder

WORKDIR /build

COPY pyproject.toml ./
COPY src/ src/

RUN pip install --no-cache-dir build \
    && python -m build --wheel --outdir /build/dist

# ---------- runtime ----------
FROM python:3.12-slim AS runtime

LABEL maintainer="Saluca LLC"

RUN groupadd -r appproxy && useradd -r -g appproxy appproxy

WORKDIR /app

COPY --from=builder /build/dist/*.whl /tmp/

RUN pip install --no-cache-dir /tmp/*.whl \
    && rm -rf /tmp/*.whl

# Copy policies and plugins
COPY policies/ policies/
COPY plugins/ plugins/

# Create writable data directory for SQLite
RUN mkdir -p /app/data && chown -R appproxy:appproxy /app/data

ENV PYTHONPATH="/app"
# Copy Cedar schema to a known location
COPY src/app_proxy/policy/schema.json /app/policies/cedar_schema.json

ENV APP_PROXY_DATABASE_URL="sqlite+aiosqlite:////app/data/app_proxy.db"
ENV APP_PROXY_CEDAR_SCHEMA_PATH="/app/policies/cedar_schema.json"
ENV APP_PROXY_POLICIES_DIR="/app/policies/cedar"

USER appproxy

EXPOSE 8081

ENTRYPOINT ["uvicorn", "app_proxy.main:app", "--host", "0.0.0.0", "--port", "8081"]
