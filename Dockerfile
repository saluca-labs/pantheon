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

# Copy default config, policies, and plugins directories
COPY config/ config/
COPY policies/ policies/
COPY plugins/ plugins/

USER appproxy

EXPOSE 8081

ENTRYPOINT ["uvicorn", "app_proxy.main:app", "--host", "0.0.0.0", "--port", "8081"]
