import assert from "node:assert/strict";
import test from "node:test";
import { attachAsyncCompletion } from "./async-completion";

test("cancels async completions before they can run callbacks", async () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((finish) => {
    resolve = finish;
  });
  let fulfilled = 0;
  let rejected = 0;
  const cancel = attachAsyncCompletion(
    promise,
    () => {
      fulfilled += 1;
    },
    () => {
      rejected += 1;
    },
  );

  cancel();
  resolve("late");
  await promise;
  await Promise.resolve();

  assert.equal(fulfilled, 0);
  assert.equal(rejected, 0);
});
