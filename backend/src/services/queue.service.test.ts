import assert from "node:assert/strict";
import test from "node:test";
import { clearQueueForTests, dequeue, enqueue, publicConfig, queuePosition } from "./queue.service.js";

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
  t.mock.timers.enable({ apis: ["setTimeout"], now: 0 });
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
