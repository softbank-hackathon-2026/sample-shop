// Sample shop for the Freesia demo: one always-on HTTP server, no dependencies.
const http = require("node:http");

const PORT = Number(process.env.PORT) || 3000;
// On-prem demo: products come from shop-api on the on-prem VM (reached over the ECS-to-on-prem link).
// If it does not answer, the shop serves its own list, and the page footer shows "sample-shop".
const BACKEND_URL = process.env.BACKEND_URL ?? "http://10.0.1.152:8080";

const products = [
  { id: 1, name: "프리지아 꽃다발", price: 32000, emoji: "💐" },
  { id: 2, name: "드라이플라워 화병", price: 18000, emoji: "🏺" },
  { id: 3, name: "꽃 일러스트 엽서 세트", price: 6000, emoji: "💌" },
  { id: 4, name: "향기 캔들", price: 21000, emoji: "🕯️" },
  { id: 5, name: "미니 화분", price: 12000, emoji: "🪴" },
  { id: 6, name: "선물 포장", price: 3000, emoji: "🎁" },
];

// The page loads products from /api/products in the browser. Deployed alone, that is this server.
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
  footer { text-align: center; padding: 24px; font-size: 13px; color: #8a948b; }
</style>
</head>
<body>
<header>
  <h1>🌼 Freesia Shop</h1>
  <p>Freesia로 배포된 쇼핑몰 서비스입니다. 오늘의 추천: 향기 캔들 🕯️</p>
</header>
<ul id="products"><li>상품을 불러오는 중입니다.</li></ul>
<footer>sample-shop · Node.js ${process.version} · 상품 정보: <span id="source">-</span></footer>
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
    .catch(() => { list.innerHTML = "<li>상품 정보를 불러오지 못했습니다.</li>"; });
</script>
</body>
</html>`;
}

async function fromBackend() {
  if (!BACKEND_URL) throw new Error("no backend");
  const r = await fetch(BACKEND_URL + "/api/products", { signal: AbortSignal.timeout(2000) });
  if (!r.ok) throw new Error(r.status);
  return r.text();
}

function send(res, body, servedBy) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "X-Served-By": servedBy }).end(body);
}

function handle(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
  } else if (path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page());
  } else if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
  } else if (path === "/api/products") {
    fromBackend()
      .then((body) => send(res, body, "shop-api"))
      .catch(() => send(res, JSON.stringify(products), "sample-shop"));
  } else {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
  }
}

const server = http.createServer(handle);

if (require.main === module) {
  server.listen(PORT, () => console.log(`sample-shop listening on ${PORT}`));
  // ECS stops tasks with SIGTERM; close cleanly so in-flight requests finish.
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}

module.exports = { server };
