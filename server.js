// Sample shop for the Freesia demo: one always-on HTTP server, no dependencies.
const http = require("node:http");

const PORT = Number(process.env.PORT) || 3000;

const products = [
  { id: 1, name: "프리지아 꽃다발", price: 32000, emoji: "💐" },
  { id: 2, name: "드라이플라워 화병", price: 18000, emoji: "🏺" },
  { id: 3, name: "꽃 일러스트 엽서 세트", price: 6000, emoji: "💌" },
  { id: 4, name: "향기 캔들", price: 21000, emoji: "🕯️" },
  { id: 5, name: "미니 화분", price: 12000, emoji: "🪴" },
  { id: 6, name: "선물 포장", price: 3000, emoji: "🎁" },
];

const won = (n) => n.toLocaleString("ko-KR") + "원";

function page() {
  const cards = products
    .map(
      (p) => `<li><span class="emoji">${p.emoji}</span><strong>${p.name}</strong><span class="price">${won(p.price)}</span></li>`,
    )
    .join("");
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
  <p>Freesia로 배포된 쇼핑몰 서비스입니다. 오늘의 추천: 프리지아 꽃다발 🌼</p>
</header>
<ul>${cards}</ul>
<footer>sample-shop · Node.js ${process.version}</footer>
</body>
</html>`;
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
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(products));
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
