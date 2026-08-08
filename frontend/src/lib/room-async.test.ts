import assert from "node:assert/strict";
import test from "node:test";
import { isActiveRoomAsyncContext, type RoomAsyncContext } from "./room-async";

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
