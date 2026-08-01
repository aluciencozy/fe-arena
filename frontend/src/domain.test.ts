import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore, normalizeAnswer, toPublicQuestion } from "../../shared/domain";

test("frontend consumes the shared public-view and grading contract", () => {
  assert.equal(normalizeAnswer("  FIFO! "), "fifo");
  assert.equal(calculateScore(true, 0, 300_000).total, 1300);
  const publicView = toPublicQuestion({ id: "q-ui-contract", topicId: "stacks", type: "short-answer", difficulty: "intro", prompt: "Name the structure used for LIFO access.", answers: ["stack"], explanation: "A stack is LIFO.", assumptions: ["Standard terminology."], provenance: { source: "FE Arena", note: "Contract fixture." } });
  assert.equal("answer" in publicView, false);
});
