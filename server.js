// Sample shop for the Freesia demo: one always-on HTTP server, no dependencies.
const http = require("node:http");

const PORT = Number(process.env.PORT) || 3000;

// The page loads products from /api/products in the browser; this server fetches them from the on-prem shop-api.
// Behind a shared load balancer that sends /api/* to shop-api, the same page shows shop-api's data.
// X-Served-By tells the page which server answered.
function page() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Freesia Shop</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #fbf8ef; color: #2c3a2f; }
  header { padding: 32px 24px 8px; text-align: center; }
  h1 { margin: 0; font-size: 28px; }
  p { color: #5d6b60; }
  ul { list-style: none; padding: 16px; margin: 0 auto; max-width: 900px;
       display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  li { background: #fff; border: 1px solid #e3dccb; border-radius: 14px; padding: 20px;
       display: flex; flex-direction: column; gap: 8px; }
  .emoji { font-size: 40px; }
  .price { color: #3f7a4f; font-weight: 700; }
  .empty { grid-column: 1 / -1; text-align: center; }
  footer { text-align: center; padding: 24px; font-size: 13px; color: #8a948b; }
</style>
</head>
<body>
<header>
  <h1>🌼 Freesia Shop</h1>
  <p>Freesia로 배포된 쇼핑몰 서비스입니다.</p>
</header>
<ul id="products"><li class="empty">상품을 불러오는 중입니다.</li></ul>
<footer>sample-shop v1 · Node.js ${process.version} · 상품 정보: <span id="source">-</span></footer>
<script>
  const won = (n) => n.toLocaleString("ko-KR") + "원";
  const list = document.getElementById("products");
  fetch("/api/products")
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      document.getElementById("source").textContent = r.headers.get("X-Served-By") || "알 수 없음";
      return r.json();
    })
    .then((products) => {
      list.replaceChildren(...products.map((p) => {
        const li = document.createElement("li");
        for (const [cls, text] of [["emoji", p.emoji], ["", p.name], ["price", won(p.price)]]) {
          const el = document.createElement(cls ? "span" : "strong");
          if (cls) el.className = cls;
          el.textContent = text;
          li.append(el);
        }
        return li;
      }));
    })
    .catch(() => { list.innerHTML = '<li class="empty">아직 연결된 백엔드가 없습니다. 상품 정보가 없습니다.</li>'; });
</script>
</body>
</html>`;
}

// The on-prem connection settings, shared by the health check and the product list.
// Returns { error } when they are missing or invalid.
function onPremConfig() {
  const { ONPREM_API_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET } = process.env;
  const mode = process.env.ONPREM_CONNECTION_MODE || "access";
  if (!ONPREM_API_URL?.trim() || (mode === "access" &&
      ![CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET].every((value) => value?.trim()))) {
    return { error: "onprem_not_configured" };
  }

  try {
    const url = new URL(ONPREM_API_URL);
    const protocols = mode === "private" ? ["http:", "https:"] : ["https:"];
    if (!["access", "private"].includes(mode) || !protocols.includes(url.protocol) || url.username || url.password) {
      throw new Error("invalid_url");
    }
  } catch {
    return { error: "onprem_invalid_configuration" };
  }

  return {
    url: ONPREM_API_URL,
    headers: mode === "access" ? {
      "CF-Access-Client-Id": CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": CF_ACCESS_CLIENT_SECRET,
    } : {},
  };
}

// The demo's on-prem shop-api, called directly at the VM's private address. Used when no ONPREM_* settings
// are given, which is the case for a platform deploy.
const DEFAULT_ONPREM = { url: "http://10.0.1.152:8080/api/health", headers: {} };

// Products from shop-api on the on-prem VM: same host and Access headers as ONPREM_API_URL, path /api/products.
// Throws when on-prem does not answer; the shop has no products of its own.
async function onPremProducts() {
  let config = onPremConfig();
  if (config.error === "onprem_not_configured") config = DEFAULT_ONPREM;
  if (config.error) throw new Error(config.error);
  const upstream = await fetch(new URL("/api/products", config.url), {
    headers: config.headers,
    redirect: "manual",
    signal: AbortSignal.timeout(3000),
  });
  if (!upstream.ok) throw new Error(`onprem_status_${upstream.status}`);
  const list = await upstream.json();
  if (!Array.isArray(list)) throw new Error("onprem_bad_products");
  return list;
}

async function checkOnPrem() {
  const config = onPremConfig();
  if (config.error) {
    return { status: 503, body: { connected: false, error: config.error } };
  }

  try {
    const upstream = await fetch(config.url, {
      headers: config.headers,
      // Never forward Access credentials to a redirect destination or a login page.
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    await upstream.body?.cancel();

    const body = { connected: upstream.ok, upstreamStatus: upstream.status };
    if (!upstream.ok) {
      body.error = upstream.status >= 300 && upstream.status < 400
        ? "onprem_redirect"
        : "onprem_upstream_error";
    }
    return { status: upstream.ok ? 200 : 502, body };
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    const errorCode = error.cause?.code || error.code;
    let reason = timedOut ? "onprem_timeout" : "onprem_request_failed";
    if (errorCode === "ENETUNREACH" || errorCode === "EHOSTUNREACH") reason = "onprem_network_unreachable";
    return {
      status: timedOut ? 504 : 502,
      body: { connected: false, error: reason },
    };
  }
}

async function handle(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
  } else if (path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page());
  } else if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
  } else if (path === "/api/onprem/health") {
    const { status, body } = await checkOnPrem();
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    }).end(JSON.stringify(body));
  } else if (path === "/api/products") {
    // The page footer shows X-Served-By, so the demo can tell the list came from the VM.
    // No backend, no products: the page then says no backend is connected yet.
    try {
      const list = await onPremProducts();
      res
        .writeHead(200, { "Content-Type": "application/json; charset=utf-8", "X-Served-By": "shop-api (on-prem)" })
        .end(JSON.stringify(list));
    } catch {
      res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "backend_unavailable" }));
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
  }
}

const server = http.createServer(handle);

if (require.main === module) {
  if (process.argv.includes("--check-onprem")) {
    checkOnPrem().then(({ status, body }) => {
      console.log(JSON.stringify(body, null, 2));
      if (status !== 200) process.exitCode = 1;
    });
  } else {
    server.listen(PORT, () => console.log(`sample-shop listening on ${PORT}`));
    // ECS stops tasks with SIGTERM; close cleanly so in-flight requests finish.
    process.on("SIGTERM", () => server.close(() => process.exit(0)));
  }
}

module.exports = { server };
