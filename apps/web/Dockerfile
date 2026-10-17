FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# Optional build-only CA; ordinary laptop builds use the system trust store.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN NEXT_TELEMETRY_DISABLED=1 npm run build
EXPOSE 3000
CMD ["npm","run","start"]
