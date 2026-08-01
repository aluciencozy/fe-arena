import assert from "node:assert/strict";
import test from "node:test";
import { clearSolo, clearSoloForTests, soloSubmit, startSolo, type SoloState } from "./solo.service.js";

const topicIds = ["stacks"] as const;

const run = (sessionId: string, timerSeconds = 30) => {
  const states: SoloState[] = [];
  startSolo(sessionId, [...topicIds], 1, timerSeconds, (state) => states.push(structuredClone(state)));
  const questionId = states[0]?.question?.id;
  assert.ok(questionId);
  return { states, questionId };
};

test("solo rejects a submission at the absolute question deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearSoloForTests();
  const { states, questionId } = run("solo-deadline");
  t.mock.timers.setTime(31_000);
  const result = soloSubmit("solo-deadline", { questionId, answer: "late" }, (state) => states.push(structuredClone(state)));
  assert.equal(result.ok, false);
  assert.equal(states.at(-1)?.phase, "RESULT");
  assert.equal(states.at(-1)?.result?.correct, false);
  clearSolo("solo-deadline");
});

test("solo timeout reveals once and clears its pending timer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearSoloForTests();
  const { states } = run("solo-timeout");
  t.mock.timers.tick(30_000);
  assert.equal(states.filter((state) => state.phase === "RESULT").length, 1);
  t.mock.timers.tick(30_000);
  assert.equal(states.filter((state) => state.phase === "RESULT").length, 1);
  clearSolo("solo-timeout");
});

test("clearing a solo session prevents timer callbacks after disconnect", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearSoloForTests();
  const { states } = run("solo-disconnect");
  clearSolo("solo-disconnect");
  t.mock.timers.tick(30_000);
  assert.equal(states.length, 1);
});
