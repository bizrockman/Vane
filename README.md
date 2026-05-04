# Vane (bizrockman fork)

A fork of [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane) used as a UI playground for testing what
later belongs into autonomous AI agents. Same answer-engine surface, different
plumbing — search and content extraction are pushed out of the Vane container
and into a self-hosted [orio-search](https://github.com/bizrockman/llm-websearch)
instance, so this fork's results pile up in a personal Meilisearch index that
grows with use.

This is **not** a drop-in replacement for upstream Vane. If you just want a
self-hosted answer engine with a bundled search stack, use upstream — it's
simpler.

## Why this fork

Upstream Vane bundles SearXNG inside the container and treats search/scrape as
a black box. That's fine for a turnkey product, but it's the wrong shape if
you want to:

- Reuse the same search/extraction layer from multiple consumers (Vane today,
  agents tomorrow, custom CLI tools later).
- Build a personal index of pages you've actually engaged with — the
  "LLM wiki" idea: every URL the system reads is cached and indexed, repeat
  visits hit a local cache, the corpus reflects your real interests over time.
- See and tune the request flow end-to-end (Bearer-auth, response headers
  exposing which path served the answer, configurable freshness, force-refresh).

So in this fork the search stack is externalised and Vane is hard-wired to
talk to orio-search via its Tavily-compatible `POST /search` and `POST /extract`
endpoints. The bundled SearXNG is removed.

## Architecture

```
┌───────────────┐      Tavily-shape       ┌─────────────────────┐
│      Vane     │  Bearer auth, JSON      │     orio-search     │
│  (this fork)  │ ───────────────────────▶│  /search /extract   │
│   Next.js UI  │                         │  Trafilatura+Meili  │
│   Agent loop  │                         │   Redis cache       │
└───────────────┘                         └─────────┬───────────┘
                                                    │
                                                    ▼
                                          ┌─────────────────────┐
                                          │       SearXNG       │
                                          │   (now external)    │
                                          └─────────────────────┘
```

Configuration via environment:

- `TAVILY_API_KEY` — Bearer key from orio-search's `ORIO_AUTH_API_KEYS`
- `TAVILY_BASE_URL` — orio-search base URL (default points at the dev deployment)
- `OPENAI_API_KEY` — for answer generation; switch via `OPENAI_BASE_URL` for
  vllm / Groq / OpenRouter / etc.

See `.env.example` and `docker-compose.override.yaml` for the full template.

## Known divergences from upstream

- **No bundled SearXNG.** Slimmer image. orio-search supplies search.
- **Search hard-wired to Tavily-compatible endpoint.** The provider toggle is
  removed; `executeSearch` always goes through `searchTavily`.
- **`/extract` cache layer.** orio-search adds a Redis-hot + Meili-persistent
  content cache with a freshness window (default 30 days), `force_refresh`
  override, and a stale-on-origin-failure fallback. Every URL the agent
  scrapes ends up in a personal Meili index searchable via `/search/local`.

## Open architecture decisions

- **JS-heavy sites in `/extract`.** orio-search uses Trafilatura over plain
  HTTP — no JS rendering. SPAs that hydrate client-side return near-empty
  shells through `/extract`. Vane's local Chromium-based `Scraper` (used in
  Quality / Deep-Research mode) handles those, so JS sites still work in
  practice — but they bypass the orio cache and don't grow the index.
  Long-term: orio-search needs a Playwright fallback (or a separate
  `/extract/dynamic` endpoint) so the cache covers SPA pages too.

## Running

```bash
git clone https://github.com/bizrockman/Vane.git
cd Vane
cp .env.example .env
# fill in TAVILY_API_KEY and OPENAI_API_KEY
docker build -t vane:orio-local .
docker compose up -d vane
```

Then open http://localhost:3000 and complete the setup wizard.

## Upstream

Everything that isn't search-stack divergence is upstream Vane's. The agent
loop, the Discover panel, the model-provider plumbing, widgets, the UI — all
courtesy of [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane), MIT
licensed. Upstream's docs on the agent architecture are at
[docs/architecture](docs/architecture/README.md), upstream's API docs at
[docs/API](docs/API/SEARCH.md), and most upstream behaviour described there
is unchanged in this fork.

## License

MIT, inherited from upstream Vane. See [LICENSE](LICENSE).
