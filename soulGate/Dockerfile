FROM python:3.12-slim

WORKDIR /app

# No extra system packages — git/curl not needed for gateway (FINDING-20)

# Install Python dependencies
COPY soulGate/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY soulGate/ soulGate/
COPY config/ config/

# Create non-root user
RUN groupadd -r soulgate && useradd -r -g soulgate soulgate
USER soulgate

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8002/health'); assert r.status_code == 200"

CMD ["uvicorn", "soulGate.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]
