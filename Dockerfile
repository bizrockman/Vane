FROM node:24.5.0-slim AS builder

RUN apt-get update && apt-get install -y python3 python3-pip sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /home/vane

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY tsconfig.json next.config.mjs next-env.d.ts postcss.config.js drizzle.config.ts tailwind.config.ts ./
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle

RUN mkdir -p /home/vane/data
RUN yarn build

# ----------------------------------------------------------------------
# Runtime image. This fork drops the bundled SearXNG that upstream ships
# inside the same container — search is delegated to an external orio-search
# instance via the Tavily-compatible /search endpoint. Only Vane (Next.js)
# and the Playwright/Chromium scraper used by Quality mode remain in here.
# ----------------------------------------------------------------------
FROM node:24.5.0-slim

RUN apt-get update && apt-get install -y \
    curl \
    python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/vane

COPY --from=builder /home/vane/public ./public
COPY --from=builder /home/vane/.next/static ./public/_next/static
COPY --from=builder /home/vane/.next/standalone ./
COPY --from=builder /home/vane/data ./data
COPY drizzle ./drizzle

RUN mkdir /home/vane/uploads

RUN yarn add playwright
RUN yarn playwright install --with-deps --only-shell chromium

WORKDIR /home/vane
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh || true

EXPOSE 3000

CMD ["/home/vane/entrypoint.sh"]
