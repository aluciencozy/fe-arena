import assert from "node:assert/strict";
import test from "node:test";
import type { Server, Socket } from "socket.io";
import { getPlayableTitlesForMode } from "../data/catalog.js";
import { registerRoomHandler } from "./room.handlers.js";

test("private rooms reject anime without tracks in the selected playlist", () => {
  const unavailableTitle = getPlayableTitlesForMode("anime", "standard").find(
    (title) =>
      !getPlayableTitlesForMode("anime", "op-ed").some(
        (playableTitle) => playableTitle.id === title.id,
      ),
  );
  assert.ok(unavailableTitle);

  const handlers = new Map<string, (...args: never[]) => void>();
  const events: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    id: "playlist-validation-socket",
    on: (event: string, handler: (...args: never[]) => void) =>
      handlers.set(event, handler),
    emit: (event: string, payload: unknown) => events.push({ event, payload }),
  } as unknown as Socket;

  registerRoomHandler({} as Server, socket);
  handlers.get("room:create-private")?.({
    username: "Host",
    mode: "anime",
    playlist: "op-ed",
    selectedTitleIds: [unavailableTitle.id],
  } as never);

  assert.deepEqual(events.at(-1), {
    event: "room:error",
    payload: "Every selected anime must have playable songs for this playlist.",
  });
});
