import assert from "node:assert/strict";
import test from "node:test";
import {
  addPlayerToRoom,
  createRoom,
  expireReconnectReservation,
  getPlayersInRoom,
  removePlayerFromRoom,
  reservePlayerForReconnect,
  restorePlayerFromReconnect,
} from "./room.service.js";

test("a reconnect token reclaims the reserved player seat", () => {
  const room = createRoom({ mode: "anime", source: "private", selectedTitleIds: ["test"] });
  const joined = addPlayerToRoom(room.roomId, "Mina", "socket-a");
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const reservation = reservePlayerForReconnect("socket-a");
  assert.equal(reservation?.username, "Mina");
  assert.deepEqual(getPlayersInRoom(room.roomId), ["Mina"]);

  const restored = restorePlayerFromReconnect(joined.reconnectToken, "socket-b", room.roomId);
  assert.equal(restored?.username, "Mina");
  assert.deepEqual(getPlayersInRoom(room.roomId), ["Mina"]);
  removePlayerFromRoom("socket-b");
});

test("an expired reconnect reservation releases the player seat", () => {
  const room = createRoom({ mode: "anime", source: "private", selectedTitleIds: ["test"] });
  const joined = addPlayerToRoom(room.roomId, "Ren", "socket-c");
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  reservePlayerForReconnect("socket-c");
  const removal = expireReconnectReservation(joined.reconnectToken);
  assert.equal(removal?.username, "Ren");
  assert.deepEqual(getPlayersInRoom(room.roomId), []);
  assert.equal(restorePlayerFromReconnect(joined.reconnectToken, "socket-d", room.roomId), null);
});
