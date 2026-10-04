const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { server } = require("./server");

test("serves the shop page, health check and product list", async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;

  const home = await fetch(base + "/");
  assert.strictEqual(home.status, 200);
  const html = await home.text();
  assert.match(html, /Freesia Shop/);
  // The browser loads the products, so a shared load balancer can send /api/* to shop-api instead.
  assert.match(html, /fetch\("\/api\/products"\)/);

  const health = await fetch(base + "/health");
  assert.deepStrictEqual([health.status, await health.json()], [200, { status: "ok" }]);

  // On-prem unreachable: no products of its own. (Without settings it would call the real demo VM.)
  process.env.ONPREM_CONNECTION_MODE = "private";
  process.env.ONPREM_API_URL = "http://127.0.0.1:9/api/health";
  t.after(() => {
    delete process.env.ONPREM_CONNECTION_MODE;
    delete process.env.ONPREM_API_URL;
  });
  const res = await fetch(base + "/api/products");
  assert.deepStrictEqual([res.status, await res.json()], [502, { error: "backend_unavailable" }]);
  assert.match(html, /아직 연결된 백엔드가 없습니다/);

  assert.strictEqual((await fetch(base + "/nope")).status, 404);
  assert.strictEqual((await fetch(base + "/", { method: "POST" })).status, 405);
});

test("takes products from on-prem shop-api, has none when it is down", async (t) => {
  // Stand-in for shop-api on the VM, reached in private mode (access mode needs HTTPS).
  const backend = http.createServer((req, res) =>
    req.url === "/api/products"
      ? res.writeHead(200, { "Content-Type": "application/json" }).end('[{"id":9,"name":"VM","price":1,"emoji":"x"}]')
      : res.writeHead(404).end());
  await new Promise((resolve) => backend.listen(0, resolve));
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => {
    server.close();
    backend.close();
    delete process.env.ONPREM_CONNECTION_MODE;
    delete process.env.ONPREM_API_URL;
  });
  const url = `http://localhost:${server.address().port}/api/products`;

  process.env.ONPREM_CONNECTION_MODE = "private";
  process.env.ONPREM_API_URL = `http://127.0.0.1:${backend.address().port}/api/health`;
  const up = await fetch(url);
  assert.strictEqual(up.headers.get("x-served-by"), "shop-api (on-prem)");
  assert.deepStrictEqual((await up.json()).map((p) => p.name), ["VM"]);

  process.env.ONPREM_API_URL = "http://127.0.0.1:9/api/health"; // nothing listens there
  const down = await fetch(url);
  assert.strictEqual(down.status, 502);
});
