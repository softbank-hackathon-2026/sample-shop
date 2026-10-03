const test = require("node:test");
const assert = require("node:assert/strict");
const { server } = require("./server");
const clientFetch = globalThis.fetch;

const configuration = {
  ONPREM_CONNECTION_MODE: "access",
  ONPREM_API_URL: "https://onprem.test/health",
  CF_ACCESS_CLIENT_ID: "test-client-id",
  CF_ACCESS_CLIENT_SECRET: "test-client-secret",
};

function configure(t, overrides = {}) {
  const previous = {};
  for (const [name, value] of Object.entries({ ...configuration, ...overrides })) {
    previous[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("checks on-prem HTTPS without exposing credentials or upstream data", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  await t.test("authenticates server-side and returns only connectivity metadata", async (t) => {
    configure(t);
    const outgoing = t.mock.method(globalThis, "fetch", async () => new Response("private upstream data"));
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { connected: true, upstreamStatus: 200 });
    assert.equal(outgoing.mock.callCount(), 1);
    const [url, options] = outgoing.mock.calls[0].arguments;
    assert.equal(url, configuration.ONPREM_API_URL);
    assert.deepEqual(options.headers, {
      "CF-Access-Client-Id": configuration.CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": configuration.CF_ACCESS_CLIENT_SECRET,
    });
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
  });

  await t.test("reports missing configuration while keeping app health available", async (t) => {
    configure(t, { CF_ACCESS_CLIENT_SECRET: undefined });
    const outgoing = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not connect"); });
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { connected: false, error: "onprem_not_configured" });
    const health = await clientFetch(base + "/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(outgoing.mock.callCount(), 0);
  });

  for (const protocol of ["http", "https"]) {
    await t.test(`connects to a private ${protocol.toUpperCase()} API without sending Access credentials`, async (t) => {
      const url = `${protocol}://10.0.1.152:8000/health`;
      configure(t, { ONPREM_CONNECTION_MODE: "private", ONPREM_API_URL: url });
      const outgoing = t.mock.method(globalThis, "fetch", async () => new Response("private upstream data"));
      const response = await clientFetch(base + "/api/onprem/health");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { connected: true, upstreamStatus: 200 });
      const [target, options] = outgoing.mock.calls[0].arguments;
      assert.equal(target, url);
      assert.deepEqual(options.headers, {});
      assert.equal(options.redirect, "manual");
    });
  }

  await t.test("private API checks do not require Access service tokens", async (t) => {
    configure(t, {
      ONPREM_CONNECTION_MODE: "private",
      ONPREM_API_URL: "http://10.0.1.152:8000/health",
      CF_ACCESS_CLIENT_ID: undefined,
      CF_ACCESS_CLIENT_SECRET: undefined,
    });
    t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { connected: true, upstreamStatus: 204 });
  });

  for (const url of ["not-a-url", "http://onprem.test/health", "https://user:password@onprem.test/health"]) {
    await t.test(`rejects unsafe or invalid URL: ${url}`, async (t) => {
      configure(t, { ONPREM_API_URL: url });
      const outgoing = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not connect"); });
      const response = await clientFetch(base + "/api/onprem/health");
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { connected: false, error: "onprem_invalid_configuration" });
      assert.equal(outgoing.mock.callCount(), 0);
    });
  }

  await t.test("does not follow login redirects or relay their body", async (t) => {
    configure(t);
    const outgoing = t.mock.method(globalThis, "fetch", async () => new Response("private login page", {
      status: 302,
      headers: { Location: "https://other-host.test/login" },
    }));
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { connected: false, upstreamStatus: 302, error: "onprem_redirect" });
    assert.equal(outgoing.mock.callCount(), 1);
    assert.equal(outgoing.mock.calls[0].arguments[1].redirect, "manual");
  });

  for (const status of [401, 403, 500]) {
    await t.test(`reports upstream ${status} without returning its body`, async (t) => {
      configure(t);
      t.mock.method(globalThis, "fetch", async () => new Response("private error details", { status }));
      const response = await clientFetch(base + "/api/onprem/health");
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { connected: false, upstreamStatus: status, error: "onprem_upstream_error" });
    });
  }

  await t.test("does not expose request details on network failure", async (t) => {
    configure(t);
    t.mock.method(globalThis, "fetch", async () => {
      throw new TypeError(`private error: ${configuration.ONPREM_API_URL} ${configuration.CF_ACCESS_CLIENT_SECRET}`);
    });
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { connected: false, error: "onprem_request_failed" });
  });

  await t.test("identifies an unreachable private network without exposing request details", async (t) => {
    configure(t, { ONPREM_CONNECTION_MODE: "private", ONPREM_API_URL: "http://10.0.1.152:8000/health" });
    t.mock.method(globalThis, "fetch", async () => {
      throw new TypeError("private transport details", { cause: { code: "ENETUNREACH" } });
    });
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { connected: false, error: "onprem_network_unreachable" });
  });

  await t.test("aborts a stalled upstream request after five seconds", async (t) => {
    configure(t);
    t.mock.method(globalThis, "fetch", async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const response = await clientFetch(base + "/api/onprem/health");
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { connected: false, error: "onprem_timeout" });
  });
});
