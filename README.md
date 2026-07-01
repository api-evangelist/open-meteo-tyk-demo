# Open-Meteo Weather & Air Quality — API demo

Fronts two free, keyless [Open-Meteo](https://open-meteo.com) services — **weather forecast** and **air quality** — two ways, so you can see what a **code** gateway and a **declarative** gateway each can and can't do over the *same* upstreams:

- **[`worker/`](worker/)** — a Cloudflare Worker (JS) that proxies both services, renames paths/params freely, merges a combined surface, and serves a demo page. Code can shape requests however it likes.
- **[`tyk/`](tyk/)** — declarative [Tyk OAS](https://tyk.io/docs/api-management/gateway-config-tyk-oas) definitions, runtime-verified on Tyk OSS. Two APIs (one upstream each), native params, no code — and honest about what declarative config **can't** do (see [tyk/README.md](tyk/README.md)).

This split is the point: the Worker's path/param rewrites and combined endpoint are trivial in JS but **don't translate to declarative Tyk config** — great fodder for a gateway comparison.

## 🔗 Live

| | URL |
|---|---|
| **Tyk (AWS)** | `https://weather-tyk.apievangelist.com/weather/forecast` · `/air/air-quality` |
| **Worker** | `https://open-meteo-tyk-demo.kinlane.workers.dev` (`/`, `/weather`, `/air-quality`, `/geocode`, `/openapi.json`) |

```bash
# Tyk (native Open-Meteo params)
curl "https://weather-tyk.apievangelist.com/weather/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,weather_code&forecast_days=2&timezone=auto"

# Worker (renamed path /weather + forecast alias — done in JS)
curl "https://open-meteo-tyk-demo.kinlane.workers.dev/weather?latitude=40.7128&longitude=-74.006&current=temperature_2m&forecast=3&timezone=auto"
```

Both add **CORS**, **caching (~5 min)**, and **request validation** (missing `latitude`/`longitude` → `422`) over the raw upstreams.

## Run locally

```bash
# Worker
cd worker && npm install && npm run dev      # http://localhost:8787

# Tyk gateway
cd tyk && docker compose up -d               # http://localhost:8080
curl "http://localhost:8080/weather/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m&forecast_days=2&timezone=auto"
```

## Repo layout

```
open-meteo-tyk-demo/
├── worker/                 # Cloudflare Worker — proxy + demo page (path/param rewrites, combined surface)
│   ├── src/index.js
│   ├── wrangler.toml
│   └── package.json
└── tyk/                    # Tyk OAS gateway (runtime-verified on OSS v5.6)
    ├── apps/               # file-based defs — a Classic+OAS PAIR per API (weather, air-quality)
    ├── yaml/               # the OAS definitions in YAML, for reading
    ├── docker-compose.yml  # Gateway + Redis
    ├── tyk.standalone.conf
    └── README.md           # the real-Tyk gotchas
```

> Note: the old `weather.apievangelist.com` Worker custom domain was retired; the Worker now lives on its `workers.dev` URL, and the canonical live gateways are the AWS-hosted `weather-tyk` / `weather-krakend` / `weather-agentgateway` subdomains (KrakenD and agentgateway are in the sibling repos).
