FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# Optional build-only CA for managed/corporate HTTPS proxies; never baked in.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
COPY app ./app
# The deterministic replay JSON fixture ships inside app/fixtures.
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
