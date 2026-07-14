import assert from "node:assert/strict";
import test from "node:test";
import { enqueuePlayer, removeFromQueue } from "./queue.service.js";

test("matchmaking keeps standard and easy queues separate", () => {
  assert.deepEqual(
    enqueuePlayer("easy-a", "Easy A", "anime", "easy"),
    { status: "waiting" },
  );
  assert.deepEqual(
    enqueuePlayer("standard-a", "Standard A", "anime", "standard"),
    { status: "waiting" },
  );

  const easyMatch = enqueuePlayer("easy-b", "Easy B", "anime", "easy");
  assert.equal(easyMatch.status, "matched");
  if (easyMatch.status === "matched") {
    assert.equal(easyMatch.opponent.username, "Easy A");
    assert.equal(easyMatch.opponent.difficulty, "easy");
  }

  removeFromQueue("standard-a");
  removeFromQueue("easy-b");
});
