FROM python:3.12-slim

WORKDIR /app

COPY supportMCP/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY supportMCP/ supportMCP/

RUN groupadd -r supportmcp && useradd -r -g supportmcp supportmcp
USER supportmcp

EXPOSE 3000

ENV PYTHONPATH=/app

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:3000/health'); assert r.status_code == 200"

CMD ["python", "-m", "supportMCP.main"]
