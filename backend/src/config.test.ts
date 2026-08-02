import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError, getRuntimeConfig, startupDiagnostics } from "./config.js";

test("local and CI defaults keep guest fallback available", () => {
  const config = getRuntimeConfig({ NODE_ENV: "test" });
  assert.equal(config.port, 3001);
  assert.deepEqual(config.frontendOrigins, ["http://localhost:5173"]);
  assert.equal(config.trustProxy, false);
  assert.equal(config.supabase.configured, false);
});

test("production requires explicit network configuration", () => {
  assert.throws(() => getRuntimeConfig({ NODE_ENV: "production" }), (error: unknown) => {
    assert.ok(error instanceof ConfigurationError);
    assert.match(error.message, /PORT/);
    assert.match(error.message, /FRONTEND_ORIGINS/);
    assert.match(error.message, /TRUST_PROXY/);
    return true;
  });
});

test("production accepts explicit origins and reports fallback without secrets", () => {
  const config = getRuntimeConfig({ NODE_ENV: "production", PORT: "8080", FRONTEND_ORIGINS: "https://arena.example,https://www.example", TRUST_PROXY: "true" });
  assert.equal(config.port, 8080);
  assert.equal(config.isProduction, true);
  assert.equal(config.supabase.configured, false);
  assert.doesNotMatch(JSON.stringify(startupDiagnostics(config)), /SECRET|KEY|supabase\.co/i);
});

test("partial Supabase server configuration fails before startup", () => {
  assert.throws(() => getRuntimeConfig({ NODE_ENV: "development", SUPABASE_URL: "https://example.supabase.co" }), /SUPABASE_URL requires/);
});

test("Auth-only Supabase configuration remains available without persistence", () => {
  const config = getRuntimeConfig({ NODE_ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable" });
  assert.equal(config.supabase.configured, false);
  assert.equal(config.supabase.authConfigured, true);
});
