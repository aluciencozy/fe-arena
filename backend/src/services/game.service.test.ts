import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGuessDamage,
  clearGameForRoom,
  getGameState,
  pauseGameForReconnect,
  resumeGameAfterReconnect,
  setPlayerReady,
} from "./game.service.js";
import { getPlayableTitlesForMode } from "../data/catalog.js";
import { addPlayerToRoom, createRoom, removePlayerFromRoom } from "./room.service.js";

test("a guess four seconds later loses meaningful damage", () => {
  const immediateDamage = calculateGuessDamage(0, 1);
  const delayedDamage = calculateGuessDamage(4, 1);

  assert.equal(immediateDamage, 1000);
  assert.equal(delayedDamage, 656);
  assert.ok(delayedDamage <= immediateDamage * 0.7);
});

test("consecutive first guesses compound damage by 1.5x", () => {
  assert.equal(calculateGuessDamage(0, 1), 1000);
  assert.equal(calculateGuessDamage(0, 2), 1500);
  assert.equal(calculateGuessDamage(0, 3), 2250);
});

test("later guesses do not inherit the first guesser's streak", () => {
  assert.equal(calculateGuessDamage(4, 1), 656);
  assert.equal(calculateGuessDamage(4, 3), 1476);
});

test("a reconnect pause freezes and restores the countdown deadline", () => {
  const title = getPlayableTitlesForMode("anime")[0];
  assert.ok(title);
  const room = createRoom({ mode: "anime", source: "private", selectedTitleIds: [title.id] });
  addPlayerToRoom(room.roomId, "A", "pause-socket-a");
  addPlayerToRoom(room.roomId, "B", "pause-socket-b");
  const players = ["A", "B"];
  const emittedStates: number[] = [];
  const events = {
    emitState: () => emittedStates.push(Date.now()),
    emitSystemMessage: () => undefined,
  };

  setPlayerReady(room.roomId, "A", players, events);
  setPlayerReady(room.roomId, "B", players, events);
  const deadlineBeforePause = getGameState(room.roomId)?.countdownEndsAt;
  assert.ok(deadlineBeforePause);
  assert.equal(pauseGameForReconnect(room.roomId, "A", Date.now() + 20_000, events), true);
  assert.equal(getGameState(room.roomId)?.connectionPause?.playerName, "A");
  assert.equal(resumeGameAfterReconnect(room.roomId, events), true);
  const resumedState = getGameState(room.roomId);
  assert.equal(resumedState?.connectionPause, null);
  assert.ok((resumedState?.countdownEndsAt ?? 0) >= deadlineBeforePause);
  assert.ok(emittedStates.length >= 4);

  clearGameForRoom(room.roomId);
  removePlayerFromRoom("pause-socket-a");
  removePlayerFromRoom("pause-socket-b");
});
