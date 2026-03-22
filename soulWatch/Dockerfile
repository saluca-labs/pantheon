FROM python:3.12-slim

WORKDIR /app

# No extra system packages — git/curl not needed for analytics sidecar (FINDING-20)

# Install Python dependencies
COPY soulWatch/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY soulWatch/ soulWatch/
COPY config/ config/
COPY src/database/models.py src/database/models.py
COPY src/database/connection.py src/database/connection.py
COPY src/__init__.py src/__init__.py
COPY src/auth/__init__.py src/auth/__init__.py
COPY src/auth/rbac.py src/auth/rbac.py

# Create non-root user
RUN groupadd -r soulwatch && useradd -r -g soulwatch soulwatch
USER soulwatch

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8001/health'); assert r.status_code == 200"

CMD ["uvicorn", "soulWatch.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
