# Open-Meteo Weather & Air Quality — Tyk OAS demo

[Tyk OAS](https://tyk.io/docs/api-management/gateway-config-tyk-oas) API definitions that proxy two free, keyless [Open-Meteo](https://open-meteo.com) services and can be exposed as MCP servers, plus a local `docker-compose` stack (Gateway + Redis) to run the whole thing.

## Layout

```
open-meteo-tyk/
├── docker-compose.yml          # Tyk Gateway (OSS) + Redis
├── tyk.standalone.conf         # file-based gateway config (loads ./apps)
├── apps/                        # OAS API definitions the gateway loads
│   ├── open-meteo-weather-air-quality-tyk-oas.json   # COMBINED: one API, two upstreams  → /env
│   ├── open-meteo-weather-tyk-oas.json               # SPLIT:   weather only            → /weather
│   └── open-meteo-air-quality-tyk-oas.json           # SPLIT:   air quality only        → /air
└── README.md
```

You get **two patterns to choose from**:

- **Combined** (`/env`) — one API fronting both Open-Meteo hosts. The forecast rides the default `upstream.url`; the air-quality operation is routed with an operation-level `urlRewrite` to the other host. One API → one MCP server with two tools. This is the "launch a new API and MCP server" story.
- **Split** (`/weather`, `/air`) — the idiomatic one-API-per-backend pattern, no URL rewrite. Two APIs → two MCP servers.

All three load at once in the demo stack (distinct listen paths, no conflict), so you can show either approach.

| Client endpoint (via Tyk) | Upstream | Defined in |
|---|---|---|
| `GET /env/forecast` | `api.open-meteo.com/v1/forecast` | combined |
| `GET /env/air-quality` | `air-quality-api.open-meteo.com/v1/air-quality` (url rewrite) | combined |
| `GET /weather/forecast` | `api.open-meteo.com/v1/forecast` | split |
| `GET /air/air-quality` | `air-quality-api.open-meteo.com/v1/air-quality` | split |

Every operation is keyless (`server.authentication.enabled: false`) and gets CORS, 5‑minute response caching (`cacheAllSafeRequests`), a 60 req/min courtesy rate limit (be a good citizen against the free upstream), and OpenAPI request validation (missing `latitude`/`longitude` → 422 before the upstream is touched).

## Run it locally

```bash
cd open-meteo-tyk
docker compose up -d
# wait a few seconds for the gateway to load ./apps
curl -sS http://localhost:8080/hello        # gateway liveness
```

### Test calls

```bash
# Combined API — forecast (default upstream) and air quality (url-rewritten host)
curl -sS "http://localhost:8080/env/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability&forecast_days=3&timezone=auto"
curl -sS "http://localhost:8080/env/air-quality?latitude=40.7128&longitude=-74.006&current=european_aqi,us_aqi,pm2_5,pm10,ozone&forecast_days=3&timezone=auto"

# Split APIs — same upstreams, one API each
curl -sS "http://localhost:8080/weather/forecast?latitude=51.5072&longitude=-0.1276&current=temperature_2m&forecast_days=2&timezone=auto"
curl -sS "http://localhost:8080/air/air-quality?latitude=51.5072&longitude=-0.1276&current=european_aqi,pm2_5&timezone=auto"

# Validation demo — omit longitude → 422 from Tyk, upstream never called
curl -sS -i "http://localhost:8080/env/forecast?latitude=40.7128"
```

### Editing / reloading

The `apps/` folder is mounted read-only and loaded at startup. After editing a definition:

```bash
docker compose restart tyk-gateway
# or hot-reload without restart:
curl -sS http://localhost:8080/tyk/reload/group -H "x-tyk-authorization: foo-secret"
```

Tear down: `docker compose down` (add `-v` to drop the Redis volume).

## Deploy to a managed / Dashboard Tyk

Any of the three files imports directly:

- **Dashboard:** APIs → Add New API → Import → OpenAPI (Tyk OAS) → upload the JSON.
- **Gateway API (headless):**
  ```bash
  curl -sS http://localhost:8080/tyk/apis/oas \
    -H "x-tyk-authorization: foo-secret" -H "Content-Type: application/json" \
    -d @apps/open-meteo-weather-air-quality-tyk-oas.json
  curl -sS http://localhost:8080/tyk/reload/group -H "x-tyk-authorization: foo-secret"
  ```

## Expose as an MCP server

Tyk generates the MCP tools from the OpenAPI operations, so the tool quality comes straight from these files — stable `operationId`s (`getWeatherForecast`, `getAirQuality`), one-line `summary`s, `description`s that enumerate the valid `hourly`/`current` variables, and typed/`required` parameters with examples. In the Dashboard, open the API and use **Expose as MCP** (Tyk AI features); the published MCP endpoint's tools map 1:1 to these operations. Point Claude or any MCP client at it and it can call the tools directly. The **combined** API gives you one MCP server exposing both tools; the **split** APIs give you one MCP server each.

> The exact MCP toggle/menu label depends on your Tyk version and licensed AI features. The OAS files are the source of truth for the tool definitions regardless of how MCP is enabled.

## Tuning
- **Rate limit:** 60/min per operation — adjust in `middleware.operations.*.rateLimit`.
- **Cache:** global `cacheAllSafeRequests` caches every GET (keyed by full path + query) for 300s. Set `enableUpstreamCacheControl: true` to honor upstream headers instead.
- **Image version:** `docker-compose.yml` pins `tykio/tyk-gateway:v5.6.0` — bump to your target Gateway version if needed.
