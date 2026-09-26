# Smart Work Platform — one image, two services (portal | vault), chosen by command.
#   docker build -t swp .            (add --build-arg WITH_PDF=0 to skip Chromium)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim
ARG WITH_PDF=1
# Chromium renders PDF exports (server/services/export.js); fonts cover Arabic.
RUN if [ "$WITH_PDF" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji tini \
      && rm -rf /var/lib/apt/lists/*; \
    else apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*; fi
ENV NODE_ENV=production \
    DATA_DIR=/data \
    CHROMIUM_PATH=/usr/bin/chromium \
    LOG_FORMAT=json \
    PORT=4000 VAULT_PORT=4100
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY vault ./vault
COPY web ./web
COPY scripts ./scripts
RUN mkdir -p /data /keys-public && chown -R node:node /data /keys-public
USER node
VOLUME ["/data"]
EXPOSE 4000 4100
ENTRYPOINT ["/usr/bin/tini", "--"]
# Portal by default; the vault service overrides the command.
CMD ["node", "--no-warnings", "server/index.js"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.SERVICE==='vault'?process.env.VAULT_PORT+'/ready':process.env.PORT+'/api/ready';fetch('http://127.0.0.1:'+p).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
