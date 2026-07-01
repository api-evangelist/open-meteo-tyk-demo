# Open-Meteo Weather & Air Quality — Tyk OAS demo

[Tyk OAS](https://tyk.io/docs/api-management/gateway-config-tyk-oas) API definitions that proxy two free, keyless [Open-Meteo](https://open-meteo.com) services, plus a local `docker-compose` stack (Gateway + Redis). **Runtime-verified on Tyk Gateway OSS v5.6.**

> These files reflect what **actually loads and serves in real Tyk OSS** — see [Gotchas](#gotchas-what-real-tyk-taught-us) for the things that bit us (and that a code gateway like the sibling Cloudflare Worker hides).

## The two APIs — one upstream each

Tyk's model is **one upstream per API**, so this is two API definitions, not one:

| Client endpoint (via Tyk) | Upstream |
|---|---|
| `GET /weather/forecast` | `api.open-meteo.com/v1/forecast` |
| `GET /air/air-quality` | `air-quality-api.open-meteo.com/v1/air-quality` |

Each is keyless (`authentication.enabled: false`) and gets CORS, response caching, request validation (missing `latitude`/`longitude` → 422 before the upstream is hit), and a courtesy rate limit. Clients pass **Open-Meteo's native query params** (`latitude`, `longitude`, `current`, `hourly`, `daily`, `forecast_days`, `timezone`).

## Layout

```
tyk/
├── docker-compose.yml     # Tyk Gateway OSS + Redis
├── tyk.standalone.conf    # file-based config (use_db_app_configs=false, app_path=/opt/tyk-gateway/apps)
├── apps/                  # file-based API definitions — a PAIR per API (see gotchas)
│   ├── open-meteo-weather.json          # Tyk Classic wrapper (is_oas: true)
│   ├── open-meteo-weather-oas.json      # the OAS definition it references
│   ├── open-meteo-air-quality.json
│   └── open-meteo-air-quality-oas.json
├── yaml/                  # the two OAS definitions in YAML, for reading
└── README.md
```

## Run it locally

```bash
cd tyk
docker compose up -d          # tyk-gateway on :8080, redis gated by healthcheck
```

### Test calls (verified)

```bash
curl "http://localhost:8080/weather/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,weather_code&forecast_days=2&timezone=auto"
curl "http://localhost:8080/air/air-quality?latitude=40.7128&longitude=-74.006&current=european_aqi,us_aqi,pm2_5&timezone=auto"

# validation: omit longitude → 422, upstream never called
curl -i "http://localhost:8080/weather/forecast?latitude=40.7128"
```

Tear down: `docker compose down` (add `-v` to drop the Redis volume).

## Live

Running on AWS behind Caddy (real Let's Encrypt certs): **https://weather-tyk.apievangelist.com/weather/forecast** and **/air/air-quality**.

## Gotchas — what real Tyk taught us

These are the reasons the definitions look the way they do. They're also the honest talking points for the KrakenD/Tyk/agentgateway comparison — a *code* gateway (the Cloudflare Worker in this repo) papers over all of them; declarative Tyk does not.

1. **File-based OAS needs a PAIR of files, not a bare OAS.** Tyk OSS file-loads a Tyk *Classic* wrapper (`x.json`, `is_oas: true`) **plus** the OAS doc (`x-oas.json`). A hand-authored single OAS file dropped in `app_path` loads as **0 APIs**. Generate the pair by POSTing your OAS to a running gateway (`/tyk/apis/oas`, with a *writable* `app_path`), then commit the pair. See [Tyk docs: Managing Tyk OAS](https://tyk.io/docs/api-management/gateway-config-managing-oas/).
2. **`rateLimit.per` must be a string duration** (`"60s"`), not an integer — an int fails schema validation and the API silently won't load.
3. **No "one API across two upstream hosts."** A combined `/env` API that URL-rewrites the air-quality operation to a *different host* returns an **empty 200** — Tyk is one-upstream-per-API. That's why this is two APIs. (KrakenD does declarative multi-backend merge; Tyk doesn't.)
4. **No declarative query-param rename.** Mapping a public `forecast` param to the upstream's `forecast_days` via `urlRewrite` + `contextVariables` does **not** work (the context var isn't substituted into a clean value). Clients use the native `forecast_days`. The Worker does this rename trivially in JS — the point being that request-shaping like this lives in *code*, not declarative Tyk config.

## Managed / Dashboard Tyk
Import either `*-oas.json` via **Dashboard → Add New API → Import → OpenAPI (Tyk OAS)**, or headless via `POST /tyk/apis/oas` (needs a writable `app_path`) then `POST /tyk/reload/group`. The Dashboard's **Expose as MCP** turns each API's operations into MCP tools (`getWeatherForecast`, `getAirQuality`).
