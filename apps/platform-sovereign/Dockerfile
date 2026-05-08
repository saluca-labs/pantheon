# ── Stage 1: build / install ──────────────────────────────────────────────────
FROM python:3.11-slim AS builder
WORKDIR /repo

RUN pip install --upgrade pip uv

COPY pyproject.toml ./
COPY src/ ./src/

RUN uv venv /app/venv && \
    . /app/venv/bin/activate && \
    uv pip install .

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runner
WORKDIR /app

RUN groupadd --gid 1001 platform && \
    useradd --uid 1001 --gid 1001 --no-create-home platform

COPY --from=builder /app/venv /app/venv
COPY --from=builder /repo /app

ENV PATH="/app/venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

USER platform
EXPOSE 8090

CMD ["/app/venv/bin/uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8090"]
