# Open-Meteo Weather & Air Quality — API demo

A small, keyless demo that fronts two free [Open-Meteo](https://open-meteo.com) services — **weather forecast** and **air quality** — as one clean API, two ways:

- **[`tyk/`](tyk/)** — declarative [Tyk OAS](https://tyk.io/docs/api-management/gateway-config-tyk-oas) gateway definitions (combined + split), plus a local `docker-compose` stack (Gateway + Redis). This is the "launch a new API + MCP server" path.
- **[`worker/`](worker/)** — a Cloudflare Worker that reimplements the same proxy façade and adds a demo page, so there's a public URL to share.

## 🔗 Live demo

**https://weather.apievangelist.com**  (also on `https://open-meteo-tyk-demo.kinlane.workers.dev`)

| Endpoint | What it does |
|---|---|
| [`/`](https://weather.apievangelist.com/) | Demo page — type a city, it geocodes and renders current temp + AQI |
| `/weather?latitude=&longitude=` | Weather forecast (proxies `api.open-meteo.com/v1/forecast`). Optional `forecast=N` days. |
| `/air-quality?latitude=&longitude=` | Air quality (proxies `air-quality-api.open-meteo.com/v1/air-quality`) |
| `/geocode?name=` | Place name → coordinates (`geocoding-api.open-meteo.com/v1/search`) |
| [`/openapi.json`](https://weather.apievangelist.com/openapi.json) | Machine-readable description of the proxy |
| `/health` | Liveness |

```bash
curl "https://weather.apievangelist.com/weather?latitude=40.7128&longitude=-74.006&current=temperature_2m,weather_code&forecast=3&timezone=auto"
curl "https://weather.apievangelist.com/air-quality?latitude=40.7128&longitude=-74.006&current=european_aqi,us_aqi,pm2_5&timezone=auto"
```

Both layers add the same value over the raw upstreams: **CORS**, **edge/response caching (~5 min)**, and **request validation** (missing `latitude`/`longitude` → `422`, upstream never touched).

## Run the Worker locally

```bash
cd worker
npm install
npm run dev        # wrangler dev — http://localhost:8787
npm run deploy     # wrangler deploy (account pinned in wrangler.toml)
```

## Run the Tyk gateway locally

```bash
cd tyk
docker compose up -d
curl "http://localhost:8080/env/weather?latitude=40.7128&longitude=-74.006&current=temperature_2m&forecast=3&timezone=auto"
```

See [tyk/README.md](tyk/README.md) for the combined vs split APIs, the MCP-expose flow, and tuning.

## Repo layout

```
open-meteo-tyk-demo/
├── worker/                 # Cloudflare Worker — public proxy + demo page
│   ├── src/index.js
│   ├── wrangler.toml
│   └── package.json
└── tyk/                    # Tyk OAS gateway
    ├── apps/               # OAS API definitions (combined + 2 split)
    ├── docker-compose.yml  # Gateway + Redis
    ├── tyk.standalone.conf
    └── README.md
```
