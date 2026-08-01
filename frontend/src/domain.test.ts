import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore, canConfigureMatch, normalizeAnswer, toPublicQuestion } from "../../shared/domain";
import { GRAPH_NODE_RADIUS, graphEdgePoints } from "./lib/graph";

test("frontend consumes the shared public-view and grading contract", () => {
  assert.equal(normalizeAnswer("  FIFO! "), "fifo");
  assert.equal(calculateScore(true, 0, 300_000).total, 1300);
  const publicView = toPublicQuestion({ id: "q-ui-contract", topicId: "stacks", type: "short-answer", difficulty: "intro", prompt: "Name the structure used for LIFO access.", answers: ["stack"], explanation: "A stack is LIFO.", assumptions: ["Standard terminology."], provenance: { source: "FE Arena", note: "Contract fixture." } });
  assert.equal("answer" in publicView, false);
});

test("public queue never grants host controls to either seated player", () => {
  assert.equal(canConfigureMatch("private", "host-seat", "host-seat"), true);
  assert.equal(canConfigureMatch("private", "host-seat", "guest-seat"), false);
  assert.equal(canConfigureMatch("public", "host-seat", "host-seat"), false);
  assert.equal(canConfigureMatch("public", "host-seat", "guest-seat"), false);
});

test("directed graph edges stop outside the destination node", () => {
  const points = graphEdgePoints({ x: 62, y: 25 }, { x: 86, y: 50 });
  assert.ok(Math.abs(Math.hypot(points.x2 - 86, points.y2 - 50) - (GRAPH_NODE_RADIUS + 2)) < 1e-9);
});
