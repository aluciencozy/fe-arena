import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGuessDamage,
  clearGameForRoom,
  getGameState,
  handleGuess,
  pauseGameForReconnect,
  resumeGameAfterReconnect,
  setPlayerReady,
} from "./game.service.js";
import { getPlayableTitlesForMode } from "../data/catalog.js";
import { addPlayerToRoom, createRoom, removePlayerFromRoom } from "./room.service.js";

test("a guess four seconds later retains most of its damage", () => {
  const immediateDamage = calculateGuessDamage(0, 1);
  const delayedDamage = calculateGuessDamage(4, 1);

  assert.equal(immediateDamage, 1000);
  assert.equal(delayedDamage, 849);
  assert.ok(delayedDamage >= immediateDamage * 0.84);
});

test("consecutive first guesses compound damage by 1.5x", () => {
  assert.equal(calculateGuessDamage(0, 1), 1000);
  assert.equal(calculateGuessDamage(0, 2), 1500);
  assert.equal(calculateGuessDamage(0, 3), 2250);
});

test("later guesses do not inherit the first guesser's streak", () => {
  assert.equal(calculateGuessDamage(4, 1), 849);
  assert.equal(calculateGuessDamage(4, 3), 1910);
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

test("the second round starts after the first reveal", (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const title = getPlayableTitlesForMode("anime")[0];
  assert.ok(title);
  const room = createRoom({ mode: "anime", source: "private", selectedTitleIds: [title.id] });
  addPlayerToRoom(room.roomId, "A", "round-socket-a");
  addPlayerToRoom(room.roomId, "B", "round-socket-b");
  const players = ["A", "B"];
  const events = { emitState: () => undefined, emitSystemMessage: () => undefined };

  setPlayerReady(room.roomId, "A", players, events);
  setPlayerReady(room.roomId, "B", players, events);
  context.mock.timers.tick(3_000);
  assert.equal(getGameState(room.roomId)?.phase, "PLAYING");

  assert.equal(handleGuess(room.roomId, "A", players, title.canonicalTitle, events), true);
  context.mock.timers.tick(5_000);
  assert.equal(getGameState(room.roomId)?.phase, "REVEAL");
  context.mock.timers.tick(6_000);
  assert.equal(getGameState(room.roomId)?.phase, "COUNTDOWN");
  assert.equal(getGameState(room.roomId)?.currentRound, 1);
  context.mock.timers.tick(3_000);
  assert.equal(getGameState(room.roomId)?.phase, "PLAYING");

  clearGameForRoom(room.roomId);
  removePlayerFromRoom("round-socket-a");
  removePlayerFromRoom("round-socket-b");
});

test("the second round starts after a timed-out first round", (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 2_000_000 });
  const title = getPlayableTitlesForMode("anime")[0];
  assert.ok(title);
  const room = createRoom({ mode: "anime", source: "private", selectedTitleIds: [title.id] });
  addPlayerToRoom(room.roomId, "A", "timeout-socket-a");
  addPlayerToRoom(room.roomId, "B", "timeout-socket-b");
  const players = ["A", "B"];
  const events = { emitState: () => undefined, emitSystemMessage: () => undefined };
  setPlayerReady(room.roomId, "A", players, events);
  setPlayerReady(room.roomId, "B", players, events);
  context.mock.timers.tick(3_000);
  context.mock.timers.tick(30_000);
  assert.equal(getGameState(room.roomId)?.phase, "REVEAL");
  context.mock.timers.tick(6_000);
  assert.equal(getGameState(room.roomId)?.phase, "COUNTDOWN");
  context.mock.timers.tick(3_000);
  assert.equal(getGameState(room.roomId)?.phase, "PLAYING");

  clearGameForRoom(room.roomId);
  removePlayerFromRoom("timeout-socket-a");
  removePlayerFromRoom("timeout-socket-b");
});
