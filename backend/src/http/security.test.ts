import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "./app.js";

const listen = async (app: ReturnType<typeof createApp>) => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not start");
  return { server, base: `http://127.0.0.1:${address.port}` };
};

test("health and readiness expose state without configuration details", async () => {
  const { server, base } = await listen(createApp({
    frontendOrigins: ["https://arena.example"],
    runtimeConfig: { frontendOrigins: ["https://arena.example"], trustProxy: true, isProduction: true },
    persistence: { configured: false, mode: "in-memory-fallback", ready: true },
  }));
  try {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const readiness = await fetch(`${base}/readyz`);
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), { status: "not_ready", persistence: { status: "fallback", configured: false, guestGameplay: true } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("security headers and exact CORS allowlist are applied", async () => {
  const { server, base } = await listen(createApp({ frontendOrigins: ["https://arena.example"] }));
  try {
    const allowed = await fetch(`${base}/api/topics`, { headers: { Origin: "https://arena.example" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://arena.example");
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
    assert.equal(allowed.headers.get("x-frame-options"), "DENY");
    assert.equal(allowed.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const denied = await fetch(`${base}/api/topics`, { headers: { Origin: "https://evil.example" } });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const oversized = await fetch(`${base}/api/unknown`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(20_000) }) });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
