import assert from "node:assert/strict";
import test from "node:test";
import { attachSeat, clearRoomsForTests, createRoom, disconnectSocket, getSeats, joinRoom, reconnectRoom, removeSeat } from "./room.service.js";
import { TOPICS, type MatchConfig } from "../../../shared/domain.js";

const config: MatchConfig = { topicIds: [TOPICS[0].id], roundCount: 5, questionTimerSeconds: 60 };

test("stable guest seats restore with the reconnect token", () => {
  clearRoomsForTests();
  const created = createRoom("private", config, "Host");
  attachSeat(created.metadata.roomId, created.seat, "socket-host");
  const joined = joinRoom(created.metadata.roomId, "Guest", "socket-guest");
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const detached = disconnectSocket("socket-guest");
  assert.equal(detached?.seat.seatId, joined.seat.seatId);
  const restored = reconnectRoom(created.metadata.roomId, joined.seat.reconnectToken, "socket-guest-new");
  assert.equal(restored.ok, true);
  assert.equal(getSeats(created.metadata.roomId).map((seat) => seat.name).join(","), "Host,Guest");
  clearRoomsForTests();
});

test("removing a seat cannot touch a different room", () => {
  clearRoomsForTests();
  const first = createRoom("private", config, "One");
  const second = createRoom("private", config, "Two");
  const removed = removeSeat(first.metadata.roomId, first.seat.seatId);
  assert.equal(removed?.roomId, first.metadata.roomId);
  assert.equal(getSeats(second.metadata.roomId)[0]?.name, "Two");
  clearRoomsForTests();
});
