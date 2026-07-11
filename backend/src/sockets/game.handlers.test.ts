import assert from "node:assert/strict";
import test from "node:test";
import type { Server, Socket } from "socket.io";
import { getPlayableTitlesForMode } from "../data/catalog.js";
import { clearGameForRoom, setPlayerReady } from "../services/game.service.js";
import {
  addPlayerToRoom,
  createRoom,
  removePlayerFromRoom,
} from "../services/room.service.js";
import { registerGameHandler } from "./game.handlers.js";

test("chat bypasses guess cooldown while game guesses retain it", (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 3_000_000 });
  const title = getPlayableTitlesForMode("anime")[0];
  assert.ok(title);
  const room = createRoom({
    mode: "anime",
    source: "private",
    selectedTitleIds: [title.id],
  });
  addPlayerToRoom(room.roomId, "A", "handler-socket-a");
  addPlayerToRoom(room.roomId, "B", "handler-socket-b");

  const handlers = new Map<string, (...args: never[]) => void>();
  const directEvents: Array<{ event: string; payload: unknown }> = [];
  const roomEvents: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    id: "handler-socket-a",
    on: (event: string, handler: (...args: never[]) => void) => handlers.set(event, handler),
    emit: (event: string, payload: unknown) => directEvents.push({ event, payload }),
  } as unknown as Socket;
  const io = {
    to: () => ({
      emit: (event: string, payload: unknown) => roomEvents.push({ event, payload }),
    }),
  } as unknown as Server;
  registerGameHandler(io, socket);

  handlers.get("chat:message")?.("hello" as never);
  assert.equal(directEvents.some(({ event }) => event === "guess:cooldown"), false);
  assert.deepEqual(roomEvents.at(-1), {
    event: "chat:broadcast",
    payload: { username: "A", message: "hello" },
  });

  const events = { emitState: () => undefined, emitSystemMessage: () => undefined };
  setPlayerReady(room.roomId, "A", ["A", "B"], events);
  setPlayerReady(room.roomId, "B", ["A", "B"], events);
  context.mock.timers.tick(3_000);
  handlers.get("game:guess")?.("definitely wrong" as never);
  assert.equal(directEvents.at(-1)?.event, "guess:cooldown");
  assert.deepEqual(roomEvents.at(-1), {
    event: "chat:broadcast",
    payload: { username: "A", message: "definitely wrong" },
  });
  const broadcastCountAfterGuess = roomEvents.length;
  const cooldownDeadline = directEvents.at(-1)?.payload;

  handlers.get("game:guess")?.("another wrong guess" as never);
  assert.equal(roomEvents.length, broadcastCountAfterGuess);
  assert.equal(directEvents.at(-1)?.event, "guess:cooldown");
  assert.equal(directEvents.at(-1)?.payload, cooldownDeadline);

  handlers.get("chat:message")?.("chat during cooldown" as never);
  assert.deepEqual(roomEvents.at(-1), {
    event: "chat:broadcast",
    payload: { username: "A", message: "chat during cooldown" },
  });

  clearGameForRoom(room.roomId);
  removePlayerFromRoom("handler-socket-a");
  removePlayerFromRoom("handler-socket-b");
});
