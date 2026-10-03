const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

// Stand-in for shop-api on the VM. Set before server.js loads.
const backend = http.createServer((req, res) =>
  res.writeHead(200, { "Content-Type": "application/json" }).end('[{"id":9,"name":"VM","price":1,"emoji":"x"}]'));
process.env.BACKEND_URL = "http://127.0.0.1:39123";
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

  const res = await fetch(base + "/api/products");
  assert.strictEqual(res.headers.get("x-served-by"), "sample-shop");
  const products = await res.json();
  assert.ok(products.length > 0 && products.every((p) => p.name && p.price && p.emoji));

  assert.strictEqual((await fetch(base + "/nope")).status, 404);
  assert.strictEqual((await fetch(base + "/", { method: "POST" })).status, 405);
});

test("takes products from the backend, falls back to its own list when it is down", async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const url = `http://localhost:${server.address().port}/api/products`;

  const down = await fetch(url);
  assert.strictEqual(down.headers.get("x-served-by"), "sample-shop");
  assert.ok((await down.json()).length > 1);

  await new Promise((resolve) => backend.listen(39123, resolve));
  t.after(() => backend.close());
  const up = await fetch(url);
  assert.strictEqual(up.headers.get("x-served-by"), "shop-api");
  assert.deepStrictEqual((await up.json()).map((p) => p.name), ["VM"]);
});
