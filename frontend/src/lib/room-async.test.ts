import assert from "node:assert/strict";
import test from "node:test";
import { attachRoomAsyncCompletion, isActiveRoomAsyncContext, type RoomAsyncContext } from "./room-async";

const context = (overrides: Partial<RoomAsyncContext> = {}): RoomAsyncContext => ({
  roomId: "ABC123",
  seatId: "seat-one",
  stageId: "prewarm:LOBBY",
  ...overrides,
});

test("accepts callbacks only for the captured room, seat, and stage", () => {
  const captured = context();
  assert.equal(isActiveRoomAsyncContext(captured, context()), true);
  assert.equal(isActiveRoomAsyncContext(captured, context({ roomId: "XYZ789" })), false);
  assert.equal(isActiveRoomAsyncContext(captured, context({ seatId: "seat-two" })), false);
  assert.equal(isActiveRoomAsyncContext(captured, context({ stageId: "question:q-coding" })), false);
});

test("reattaches a prewarm completion after a same-stage rerender", async () => {
  let resolvePrewarm!: () => void;
  const prewarm = new Promise<void>((resolve) => {
    resolvePrewarm = resolve;
  });
  let current = context();
  let readySignals = 0;
  const firstCleanup = attachRoomAsyncCompletion(
    prewarm,
    current,
    () => current,
    () => {
      readySignals += 1;
    },
    () => undefined,
  );

  firstCleanup();
  current = context();
  const secondCleanup = attachRoomAsyncCompletion(
    prewarm,
    current,
    () => current,
    () => {
      readySignals += 1;
    },
    () => undefined,
  );

  resolvePrewarm();
  await prewarm;
  await Promise.resolve();
  assert.equal(readySignals, 1);
  secondCleanup();
});
