/**
 * Open-Meteo Weather & Air Quality - Cloudflare Worker
 *
 * A public proxy facade over two free, keyless Open-Meteo services, mirroring the
 * Tyk OAS gateway in ../tyk. Adds CORS, edge caching, and request validation, and
 * serves a small demo page at / that types a city, geocodes it, and renders the
 * current temperature + air quality.
 *
 *   GET /                -> demo HTML page
 *   GET /forecast        -> api.open-meteo.com/v1/forecast              (requires latitude, longitude)
 *   GET /air-quality     -> air-quality-api.open-meteo.com/v1/air-quality (requires latitude, longitude)
 *   GET /geocode         -> geocoding-api.open-meteo.com/v1/search      (requires name)
 *   GET /openapi.json    -> machine-readable description of this proxy
 *   GET /health          -> liveness
 */

const UPSTREAMS = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  "air-quality": "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
};

const CACHE_TTL = 300; // seconds

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "3600",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

async function proxy(upstreamBase, url, required) {
  const params = url.searchParams;
  for (const p of required) {
    if (!params.has(p) || params.get(p) === "") {
      return json({ error: `missing required query parameter: ${p}` }, 422);
    }
  }
  const target = `${upstreamBase}?${params.toString()}`;
  let resp;
  try {
    resp = await fetch(target, { cf: { cacheEverything: true, cacheTtl: CACHE_TTL } });
  } catch (e) {
    return json({ error: "upstream fetch failed", detail: String(e) }, 502);
  }
  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("Content-Type") || "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
      "X-Proxied-By": "cloudflare-worker/open-meteo-tyk-demo",
      ...CORS,
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    switch (url.pathname) {
      case "/":
      case "/index.html":
        return new Response(HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60", ...CORS },
        });
      case "/forecast":
        return proxy(UPSTREAMS.forecast, url, ["latitude", "longitude"]);
      case "/air-quality":
        return proxy(UPSTREAMS["air-quality"], url, ["latitude", "longitude"]);
      case "/geocode":
        return proxy(UPSTREAMS.geocode, url, ["name"]);
      case "/openapi.json":
        return json(openapi(url.origin));
      case "/health":
        return json({ status: "ok" });
      default:
        return json(
          { error: "not found", paths: ["/", "/forecast", "/air-quality", "/geocode", "/openapi.json", "/health"] },
          404
        );
    }
  },
};

function openapi(origin) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Open-Meteo Weather & Air Quality (Cloudflare Worker)",
      version: "1.0.0",
      description: "Public proxy over Open-Meteo forecast, air-quality, and geocoding. Keyless.",
    },
    servers: [{ url: origin }],
    paths: {
      "/forecast": {
        get: {
          operationId: "getWeatherForecast",
          summary: "Weather forecast for a coordinate",
          parameters: [
            { name: "latitude", in: "query", required: true, schema: { type: "number" } },
            { name: "longitude", in: "query", required: true, schema: { type: "number" } },
            { name: "current", in: "query", schema: { type: "string" } },
            { name: "hourly", in: "query", schema: { type: "string" } },
            { name: "daily", in: "query", schema: { type: "string" } },
            { name: "forecast_days", in: "query", schema: { type: "integer" } },
            { name: "timezone", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Forecast" } },
        },
      },
      "/air-quality": {
        get: {
          operationId: "getAirQuality",
          summary: "Air quality forecast for a coordinate",
          parameters: [
            { name: "latitude", in: "query", required: true, schema: { type: "number" } },
            { name: "longitude", in: "query", required: true, schema: { type: "number" } },
            { name: "current", in: "query", schema: { type: "string" } },
            { name: "hourly", in: "query", schema: { type: "string" } },
            { name: "forecast_days", in: "query", schema: { type: "integer" } },
            { name: "timezone", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Air quality" } },
        },
      },
      "/geocode": {
        get: {
          operationId: "geocodePlace",
          summary: "Resolve a place name to coordinates",
          parameters: [
            { name: "name", in: "query", required: true, schema: { type: "string" } },
            { name: "count", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Geocoding results" } },
        },
      },
    },
  };
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Weather &amp; Air Quality &mdash; Open-Meteo via Tyk / Cloudflare</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #10233f 0%, #0a0f1c 55%, #070a12 100%);
    color: #e8eefc; min-height:100vh; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; }
  h1 { font-size: 1.6rem; margin:0 0 6px; letter-spacing:.2px; }
  .sub { color:#8ea3c7; margin:0 0 28px; font-size:.95rem; }
  a { color:#7fb0ff; }
  form { display:flex; gap:10px; margin-bottom:24px; }
  input { flex:1; padding:14px 16px; border-radius:12px; border:1px solid #24406e; background:#0d1a30; color:#e8eefc; font-size:1rem; }
  input:focus { outline:none; border-color:#3f7bd8; }
  button { padding:14px 20px; border-radius:12px; border:0; background:#3f7bd8; color:#fff; font-weight:600; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  .cards { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:560px){ .cards{ grid-template-columns:1fr; } form{ flex-direction:column; } }
  .card { background:linear-gradient(180deg,#0f2036,#0c1729); border:1px solid #1d3357; border-radius:16px; padding:20px; }
  .card h2 { margin:0 0 4px; font-size:.8rem; text-transform:uppercase; letter-spacing:.12em; color:#7f98c2; }
  .big { font-size:2.4rem; font-weight:700; margin:6px 0; }
  .row { display:flex; justify-content:space-between; padding:6px 0; border-top:1px solid #16273f; font-size:.92rem; color:#b9c8e6; }
  .row span:last-child { color:#e8eefc; font-weight:600; }
  .place { margin: 4px 0 20px; color:#9fb4d8; }
  .aqi-pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:.8rem; font-weight:700; }
  .muted { color:#6f84a8; font-size:.82rem; margin-top:26px; line-height:1.5; }
  .muted code { background:#0d1a30; padding:2px 6px; border-radius:6px; color:#bcd0f0; }
  .err { color:#ff9d9d; margin:12px 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>&#127780;&#65039; Weather &amp; Air Quality</h1>
  <p class="sub">One request path per service, proxied at the edge from the free <a href="https://open-meteo.com">Open-Meteo</a> APIs. Same facade as the Tyk OAS gateway in this repo.</p>
  <form id="f">
    <input id="q" placeholder="Type a city - e.g. New York, Tokyo, Nairobi..." autocomplete="off" />
    <button id="go" type="submit">Get conditions</button>
  </form>
  <div id="place" class="place"></div>
  <div id="err" class="err"></div>
  <div class="cards" id="cards" style="display:none">
    <div class="card">
      <h2>Weather now</h2>
      <div class="big" id="temp">-</div>
      <div id="cond" class="place" style="margin:0 0 8px"></div>
      <div class="row"><span>Feels like</span><span id="feels">-</span></div>
      <div class="row"><span>Humidity</span><span id="hum">-</span></div>
      <div class="row"><span>Wind</span><span id="wind">-</span></div>
    </div>
    <div class="card">
      <h2>Air quality now</h2>
      <div class="big"><span id="aqi">-</span> <span class="aqi-pill" id="aqiPill"></span></div>
      <div id="aqiCat" class="place" style="margin:0 0 8px"></div>
      <div class="row"><span>US AQI</span><span id="usaqi">-</span></div>
      <div class="row"><span>PM2.5</span><span id="pm25">-</span></div>
      <div class="row"><span>PM10</span><span id="pm10">-</span></div>
      <div class="row"><span>Ozone</span><span id="o3">-</span></div>
    </div>
  </div>
  <p class="muted">
    Under the hood this page calls <code>/geocode</code>, then <code>/forecast</code> and <code>/air-quality</code> on this same Worker.
    Try them directly: <a id="lnkF">/forecast</a> &middot; <a id="lnkA">/air-quality</a> &middot; <a href="/openapi.json">/openapi.json</a>
  </p>
</div>
<script>
const DEG = "\\u00b0", UGM3 = " \\u00b5g/m\\u00b3";
const WMO = {0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Rime fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Thunderstorm w/ hail"};
function euaqi(v){ if(v==null)return["","",""]; if(v<=20)return["Good","#5bd88a","#0a2a17"]; if(v<=40)return["Fair","#b6d85b","#22280a"]; if(v<=60)return["Moderate","#e8c34a","#2a230a"]; if(v<=80)return["Poor","#e8934a","#2a1a0a"]; if(v<=100)return["Very poor","#e85b5b","#2a0a0a"]; return["Extremely poor","#a24ae8","#1c0a2a"]; }
const $ = id => document.getElementById(id);
$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if(!q) return;
  $("err").textContent=""; $("place").textContent="Locating..."; $("go").disabled=true; $("cards").style.display="none";
  try {
    const g = await (await fetch("/geocode?count=1&name="+encodeURIComponent(q))).json();
    const hit = g && g.results && g.results[0];
    if(!hit){ $("place").textContent=""; $("err").textContent='No match for "'+q+'".'; return; }
    const lat=hit.latitude, lon=hit.longitude;
    $("place").textContent = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ") + "  -  " + lat.toFixed(3) + ", " + lon.toFixed(3);
    const base = "latitude="+lat+"&longitude="+lon+"&timezone=auto";
    const fUrl = "/forecast?"+base+"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m";
    const aUrl = "/air-quality?"+base+"&current=european_aqi,us_aqi,pm2_5,pm10,ozone";
    $("lnkF").href=fUrl; $("lnkA").href=aUrl;
    const [f,a] = await Promise.all([ fetch(fUrl).then(r=>r.json()), fetch(aUrl).then(r=>r.json()) ]);
    const c = f.current||{}, cu=f.current_units||{};
    $("temp").textContent = (c.temperature_2m!=null? Math.round(c.temperature_2m):"-")+(cu.temperature_2m||DEG+"C");
    $("cond").textContent = WMO[c.weather_code]||"";
    $("feels").textContent = c.apparent_temperature!=null? Math.round(c.apparent_temperature)+(cu.temperature_2m||DEG+"C"):"-";
    $("hum").textContent = c.relative_humidity_2m!=null? c.relative_humidity_2m+"%":"-";
    $("wind").textContent = c.wind_speed_10m!=null? c.wind_speed_10m+" "+(cu.wind_speed_10m||"km/h"):"-";
    const ac = a.current||{};
    const eu = euaqi(ac.european_aqi);
    $("aqi").textContent = ac.european_aqi!=null? ac.european_aqi : "-";
    const pill=$("aqiPill"); pill.textContent = eu[0]; pill.style.background=eu[2]; pill.style.color=eu[1];
    $("aqiCat").textContent = eu[0]? "European AQI - "+eu[0] : "";
    $("usaqi").textContent = ac.us_aqi!=null? ac.us_aqi : "-";
    $("pm25").textContent = ac.pm2_5!=null? ac.pm2_5+UGM3 : "-";
    $("pm10").textContent = ac.pm10!=null? ac.pm10+UGM3 : "-";
    $("o3").textContent = ac.ozone!=null? ac.ozone+UGM3 : "-";
    $("cards").style.display="grid";
  } catch(err){ $("err").textContent="Something went wrong: "+err; }
  finally { if($("place").textContent==="Locating...") $("place").textContent=""; $("go").disabled=false; }
});
</script>
</body>
</html>`;
