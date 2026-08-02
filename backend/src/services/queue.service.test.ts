import assert from "node:assert/strict";
import test from "node:test";
import { clearQueueForTests, dequeue, enqueue, publicConfig, queuePosition, suspend } from "./queue.service.js";

test("public queue matches FIFO entries and uses fixed five-minute settings", () => {
  clearQueueForTests();
  const first = enqueue({ socketId: "socket-a", username: "Ada", queuedAt: 10 });
  assert.equal(first.status, "waiting");
  if (first.status === "waiting") assert.equal(first.expiresAt, 300010);
  const second = enqueue({ socketId: "socket-b", username: "Grace", queuedAt: 20 });
  assert.equal(second.status, "matched");
  if (second.status === "matched") assert.equal(second.opponent.username, "Ada");
  assert.equal(publicConfig.questionTimerSeconds, 300);
  assert.equal(publicConfig.roundCount, 5);
  clearQueueForTests();
});

test("queue leave is idempotent", () => {
  clearQueueForTests();
  enqueue({ socketId: "socket-a", username: "Ada", queuedAt: Date.now() });
  assert.equal(dequeue("socket-a"), true);
  assert.equal(dequeue("socket-a"), false);
  clearQueueForTests();
});

test("queue entries expire after five minutes", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  clearQueueForTests();
  let expired = false;
  enqueue({ socketId: "socket-a", username: "Ada", queuedAt: 0 }, () => { expired = true; });
  t.mock.timers.tick(299_999);
  assert.equal(expired, false);
  assert.equal(queuePosition("socket-a"), 1);
  t.mock.timers.tick(1);
  assert.equal(expired, true);
  assert.equal(queuePosition("socket-a"), 0);
  clearQueueForTests();
});

test("queue reattachment preserves the original position and deadline", () => {
  clearQueueForTests();
  const queuedAt = Date.now();
  const first = enqueue({ socketId: "socket-a", username: "Ada", queuedAt });
  assert.equal(first.status, "waiting");
  if (first.status !== "waiting") return;
  assert.equal(suspend("socket-a"), true);
  const second = enqueue({ socketId: "socket-b", username: "Grace", queuedAt: queuedAt + 1 });
  assert.equal(second.status, "waiting");
  assert.equal(queuePosition("socket-b"), 2);
  const reattached = enqueue({ socketId: "socket-a-new", username: "Ada", queuedAt: Date.now(), queueToken: first.queueToken });
  assert.equal(reattached.status, "waiting");
  if (reattached.status !== "waiting") return;
  assert.equal(reattached.expiresAt, first.expiresAt);
  assert.equal(queuePosition("socket-a-new"), 1);
  const third = enqueue({ socketId: "socket-c", username: "Lin", queuedAt: Date.now() });
  assert.equal(third.status, "matched");
  if (third.status === "matched") assert.equal(third.opponent.username, "Ada");
  clearQueueForTests();
});
