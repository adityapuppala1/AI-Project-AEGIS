FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# Optional build-only CA for managed/corporate HTTPS proxies; never baked in.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
# Optional statistical forecast (compose.timesfm.yaml): CPU-only PyTorch and TimesFM, about 1 GB. Off by default.
ARG INSTALL_TIMESFM=0
RUN --mount=type=secret,id=proxy_ca     if [ "$INSTALL_TIMESFM" = "1" ]; then       if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi;       pip install --no-cache-dir torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu &&       pip install --no-cache-dir "timesfm[torch]==3.0.2";     fi
# Current Debian security fixes and patched Python build tools (image scan findings).
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* && pip install --no-cache-dir --upgrade "setuptools>=80" "wheel>=0.46.2"
COPY app ./app
# The deterministic replay JSON fixture ships inside app/fixtures.
# Run as an unprivileged user: the API reads its code and writes nothing to the image.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin aegis
USER aegis
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
