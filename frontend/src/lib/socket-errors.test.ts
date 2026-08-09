import assert from "node:assert/strict";
import test from "node:test";
import { socketConnectionErrorMessage, socketDisconnectedMessage } from "./socket-errors";
import { socketConnectionOptions } from "./socket-config";

test("Socket.IO keeps WebSocket and polling with fallback enabled", () => {
  assert.deepEqual(socketConnectionOptions.transports, ["websocket", "polling"]);
  assert.equal(socketConnectionOptions.tryAllTransports, true);
});

test("connection failures give guests a production-safe recovery message", () => {
  const message = socketConnectionErrorMessage(new Error("websocket error"), "http://localhost:3001");
  assert.match(message, /Could not connect/);
  assert.match(message, /try again shortly/);
  assert.doesNotMatch(message, /npm run dev/);
});

test("disconnect messages explain automatic recovery", () => {
  assert.match(socketDisconnectedMessage("http://localhost:3001"), /retry automatically/);
});
