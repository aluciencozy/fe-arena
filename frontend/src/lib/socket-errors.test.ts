import assert from "node:assert/strict";
import test from "node:test";
import { socketConnectionErrorMessage, socketDisconnectedMessage } from "./socket-errors";
import { socketConnectionOptions } from "./socket-config";

test("Socket.IO keeps WebSocket and polling with fallback enabled", () => {
  assert.deepEqual(socketConnectionOptions.transports, ["websocket", "polling"]);
  assert.equal(socketConnectionOptions.tryAllTransports, true);
});

test("connection failures tell local guests how to restore the server connection", () => {
  const message = socketConnectionErrorMessage(new Error("websocket error"), "http://localhost:3001");
  assert.match(message, /Could not connect/);
  assert.match(message, /cd backend && npm run dev/);
  assert.match(message, /VITE_SOCKET_URL/);
});

test("disconnect messages explain automatic recovery", () => {
  assert.match(socketDisconnectedMessage("http://localhost:3001"), /retry automatically/);
});
