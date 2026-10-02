const test = require("node:test");
const assert = require("node:assert");
const { server } = require("./server");

test("serves the shop page, health check and product list", async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;

  const home = await fetch(base + "/");
  assert.strictEqual(home.status, 200);
  assert.match(await home.text(), /Freesia Shop/);

  const health = await fetch(base + "/health");
  assert.deepStrictEqual([health.status, await health.json()], [200, { status: "ok" }]);

  const products = await (await fetch(base + "/api/products")).json();
  assert.ok(products.length > 0);

  assert.strictEqual((await fetch(base + "/nope")).status, 404);
  assert.strictEqual((await fetch(base + "/", { method: "POST" })).status, 405);
});
