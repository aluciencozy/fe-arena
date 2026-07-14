import assert from "node:assert/strict";
import test from "node:test";
import { enqueuePlayer, removeFromQueue } from "./queue.service.js";

test("matchmaking partitions players by mode and playlist", () => {
  assert.deepEqual(
    enqueuePlayer("op-ed-a", "OP ED A", "anime", "op-ed"),
    { status: "waiting" },
  );
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
    assert.equal(easyMatch.opponent.playlist, "easy");
  }

  const opEdMatch = enqueuePlayer("op-ed-b", "OP ED B", "anime", "op-ed");
  assert.equal(opEdMatch.status, "matched");
  if (opEdMatch.status === "matched") {
    assert.equal(opEdMatch.opponent.username, "OP ED A");
    assert.equal(opEdMatch.opponent.playlist, "op-ed");
  }

  removeFromQueue("standard-a");
  removeFromQueue("easy-b");
  removeFromQueue("op-ed-b");
});
