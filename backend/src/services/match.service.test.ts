import assert from "node:assert/strict";
import test from "node:test";
import { attachSeat, clearRoomsForTests, createRoom, joinRoom } from "./room.service.js";
import { clearMatch, clearMatchesForTests, configureMatch, ensureMatch, getMatchState, toggleReady } from "./match.service.js";
import { TOPICS, type MatchConfig } from "../../../shared/domain.js";

const events = () => ({ emit: (_state: unknown) => undefined, message: (_text: string) => undefined });
const config: MatchConfig = { topicIds: ["stacks", "queues"], roundCount: 5, questionTimerSeconds: 60 };

test("match state machine enters ready/countdown and keeps answers private", () => {
  clearMatchesForTests(); clearRoomsForTests();
  const room = createRoom("private", config, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  const initial = ensureMatch(room.metadata.roomId)!;
  assert.equal(initial.phase, "LOBBY");
  assert.equal(initial.question, null);
  assert.equal("answer" in initial, false);
  if (!guest.ok) return;
  configureMatch(room.metadata.roomId, room.seat.seatId, config, events());
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "READY");
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "COUNTDOWN");
  clearMatch(room.metadata.roomId); clearMatchesForTests(); clearRoomsForTests();
});

test("simultaneous rooms have isolated state", () => {
  clearMatchesForTests(); clearRoomsForTests();
  const first = createRoom("private", { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 }, "A");
  const second = createRoom("private", { topicIds: [TOPICS[3].id], roundCount: 1, questionTimerSeconds: 30 }, "B");
  const firstState = ensureMatch(first.metadata.roomId)!;
  const secondState = ensureMatch(second.metadata.roomId)!;
  assert.notEqual(firstState.roomId, secondState.roomId);
  assert.equal(firstState.config.topicIds[0], TOPICS[2].id);
  assert.equal(secondState.config.topicIds[0], TOPICS[3].id);
  clearMatchesForTests(); clearRoomsForTests();
});
