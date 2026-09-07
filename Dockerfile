# Debian-based (not Alpine) so better-sqlite3's native addon has prebuilt
# binaries available — Alpine's musl libc often forces a from-source build.
FROM node:22-bookworm-slim

WORKDIR /app

# Fallback build toolchain in case no prebuilt better-sqlite3 binary matches
# this platform and it has to compile from source.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
