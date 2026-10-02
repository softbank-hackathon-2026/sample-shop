const test = require("node:test");
const assert = require("node:assert");
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
