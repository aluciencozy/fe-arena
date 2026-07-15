import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBalancedPlaylist,
  calculateGuessDamage,
  clearGameForRoom,
  getGameState,
  getRandomVideoStartTime,
  handleGuess,
  pauseGameForReconnect,
  resumeGameAfterReconnect,
  setPlayerReady,
} from "./game.service.js";
import {
  getPlayableTitlesForMode,
  getTracksForPlaylist,
} from "../data/catalog.js";
import type { CatalogTitle } from "../types/index.js";
import type { PlaylistTrack } from "./game.service.js";
import { addPlayerToRoom, createRoom, removePlayerFromRoom } from "./room.service.js";

const makeTrack = (titleId: string, index: number): PlaylistTrack => ({
  id: `${titleId}-${index}`,
  videoId: `${titleId}-video-${index}`,
  title: `${titleId} track ${index}`,
  titleId,
  canonicalTitle: titleId,
  romajiName: null,
  nativeName: null,
  answerAliases: [],
});

test("random starts leave room for the complete 30-second excerpt", () => {
  assert.equal(
    getRandomVideoStartTime(
      { ...makeTrack("long", 1), durationSeconds: 100 },
      () => 0.75,
    ),
    52.5,
  );
  assert.equal(
    getRandomVideoStartTime(
      { ...makeTrack("short", 1), durationSeconds: 20 },
      () => 0.75,
    ),
    0,
  );
});

test("an OP & ED room builds rounds from theme tracks only", (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 500_000 });
  const title = getPlayableTitlesForMode("anime", "op-ed")[0];
  assert.ok(title);
  const room = createRoom({
    mode: "anime",
    playlist: "op-ed",
    source: "private",
    selectedTitleIds: [title.id],
  });
  addPlayerToRoom(room.roomId, "A", "op-ed-socket-a");
  addPlayerToRoom(room.roomId, "B", "op-ed-socket-b");
  const events = { emitState: () => undefined, emitSystemMessage: () => undefined };

  setPlayerReady(room.roomId, "A", ["A", "B"], events);
  setPlayerReady(room.roomId, "B", ["A", "B"], events);
  context.mock.timers.tick(3_000);

  const state = getGameState(room.roomId);
  assert.equal(state?.playlist, "op-ed");
  assert.ok(
    getTracksForPlaylist(title, "op-ed").some(
      (track) => track.videoId === state?.currentVideoID,
    ),
  );

  clearGameForRoom(room.roomId);
  removePlayerFromRoom("op-ed-socket-a");
  removePlayerFromRoom("op-ed-socket-b");
});

test("playlist rotation gives each anime the same number of slots", () => {
  const playlist = buildBalancedPlaylist(
    [
      [makeTrack("one", 1), makeTrack("one", 2), makeTrack("one", 3)],
      [makeTrack("two", 1)],
      [makeTrack("three", 1), makeTrack("three", 2)],
    ],
    () => 0,
  );
  const counts = playlist.reduce<Record<string, number>>((result, track) => {
    result[track.titleId] = (result[track.titleId] ?? 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, { one: 3, two: 3, three: 3 });
});

test("easy mode keeps each anime to at most ten ranked tracks", () => {
  const title = getPlayableTitlesForMode("anime")[0];
  assert.ok(title);
  const easyTrackCount = getTracksForPlaylist(title, "easy").length;
  assert.ok(easyTrackCount > 0 && easyTrackCount <= 10);
});

test("easy mode honors explicit track ranks", () => {
  const title: CatalogTitle = {
    id: "custom-title",
    mode: "anime",
    name: "Custom title",
    canonicalTitle: "Custom title",
    coverImageUrl: "https://example.com/cover.jpg",
    answerAliases: [],
    tracks: [
      { id: "rank-one", videoId: "one", easyModeRank: 1, category: "ost" },
      { id: "rank-ten", videoId: "ten", easyModeRank: 10, category: "ost" },
      { id: "rank-eleven", videoId: "eleven", easyModeRank: 11, category: "ost" },
    ],
  };

  assert.deepEqual(
    getTracksForPlaylist(title, "easy").map((track) => track.id),
    ["rank-one", "rank-ten"],
  );
});

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

test("a player can toggle ready back to unready in the lobby", () => {
  const title = getPlayableTitlesForMode("anime")[0];
  assert.ok(title);
  const room = createRoom({
    mode: "anime",
    source: "private",
    selectedTitleIds: [title.id],
  });
  addPlayerToRoom(room.roomId, "A", "ready-socket-a");
  addPlayerToRoom(room.roomId, "B", "ready-socket-b");
  const events = { emitState: () => undefined, emitSystemMessage: () => undefined };

  setPlayerReady(room.roomId, "A", ["A", "B"], events);
  assert.equal(getGameState(room.roomId)?.ready.A, true);
  setPlayerReady(room.roomId, "A", ["A", "B"], events);
  assert.equal(getGameState(room.roomId)?.ready.A, false);

  clearGameForRoom(room.roomId);
  removePlayerFromRoom("ready-socket-a");
  removePlayerFromRoom("ready-socket-b");
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
