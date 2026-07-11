import assert from "node:assert/strict";
import test from "node:test";
import { getCountdownSeconds, shouldPlayCountdownCue } from "./timers.ts";

test("a stale render clock cannot display more than the three-second countdown", () => {
  const staleNowFromBeforeReveal = 1_000_000;
  const countdownEndsAfterReveal = staleNowFromBeforeReveal + 6_000 + 3_000;

  assert.equal(
    getCountdownSeconds(countdownEndsAfterReveal, staleNowFromBeforeReveal),
    3,
  );
});

test("countdown display preserves valid boundary values", () => {
  const now = 2_000_000;
  assert.equal(getCountdownSeconds(now + 2_000, now), 2);
  assert.equal(getCountdownSeconds(now + 1_000, now), 1);
  assert.equal(getCountdownSeconds(now, now), 0);
  assert.equal(getCountdownSeconds(null, now), null);
});

test("countdown cues play once for positive changed countdown values", () => {
  assert.equal(shouldPlayCountdownCue("COUNTDOWN", 3, null), true);
  assert.equal(shouldPlayCountdownCue("COUNTDOWN", 3, 3), false);
  assert.equal(shouldPlayCountdownCue("COUNTDOWN", 2, 3), true);
  assert.equal(shouldPlayCountdownCue("COUNTDOWN", 1, 2), true);
  assert.equal(shouldPlayCountdownCue("COUNTDOWN", 0, 1), false);
  assert.equal(shouldPlayCountdownCue("PLAYING", 3, null), false);
});
