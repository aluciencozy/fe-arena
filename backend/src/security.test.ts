import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowLimiter, isAllowedOrigin } from "./security.js";

test("fixed window limiter allows a burst then returns a retry duration", () => {
  const limiter = new FixedWindowLimiter(2, 1_000);
  assert.equal(limiter.check("client", 100).allowed, true);
  assert.equal(limiter.check("client", 200).allowed, true);
  const blocked = limiter.check("client", 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(limiter.check("other", 300).allowed, true);
});

test("origin checks are exact and production can require a browser origin", () => {
  const origins = ["https://arena.example"];
  assert.equal(isAllowedOrigin("https://arena.example", origins, true), true);
  assert.equal(isAllowedOrigin("https://evil.example", origins, true), false);
  assert.equal(isAllowedOrigin(undefined, origins, true), false);
  assert.equal(isAllowedOrigin(undefined, origins, false), true);
});
