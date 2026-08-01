import assert from "node:assert/strict";
import test from "node:test";
import type { Server, Socket } from "socket.io";
import { TOPICS, type MatchConfig } from "../../../shared/domain.js";
import { clearMatchesForTests, configureMatch, ensureMatch, getMatchState, toggleReady } from "../services/match.service.js";
import { clearQueueForTests, queuePosition } from "../services/queue.service.js";
import { attachSeat, clearRoomsForTests, createRoom, joinRoom } from "../services/room.service.js";
import { registerHandlers } from "./handlers.js";

type Handler = (payload?: unknown) => void;

class TestSocket {
  readonly handlers = new Map<string, Handler>();
  readonly sent: Array<{ event: string; payload: unknown }> = [];
  readonly joined = new Set<string>();

  constructor(readonly id: string) {}

  on(event: string, handler: Handler) { this.handlers.set(event, handler); return this; }
  emit(event: string, payload?: unknown) { this.sent.push({ event, payload }); return true; }
  join(roomId: string) { this.joined.add(roomId); }
  leave(roomId: string) { this.joined.delete(roomId); }
  trigger(event: string, payload?: unknown) { this.handlers.get(event)?.(payload); }
}

class TestIo {
  readonly broadcasts: Array<{ roomId: string; event: string; payload: unknown }> = [];
  readonly sockets = { sockets: new Map<string, Socket>() };

  to(roomId: string) {
    return { emit: (event: string, payload: unknown) => { this.broadcasts.push({ roomId, event, payload }); } };
  }
}

const config: MatchConfig = { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 };
const asSocket = (socket: TestSocket) => socket as unknown as Socket;
const asServer = (io: TestIo) => io as unknown as Server;
const reset = () => { clearMatchesForTests(); clearQueueForTests(); clearRoomsForTests(); };

test("room and queue entry keep one socket in one lifecycle", () => {
  reset();
  const io = new TestIo();
  const socket = new TestSocket("host");
  registerHandlers(asServer(io), asSocket(socket));
  socket.trigger("queue:join", { username: "Host" });
  assert.equal(queuePosition(socket.id), 1);
  socket.trigger("room:create-private", { username: "Host", config });
  assert.equal(queuePosition(socket.id), 0);
  assert.equal(socket.sent.filter(({ event }) => event === "room:session").length, 1);
  socket.trigger("room:create-private", { username: "Host", config });
  socket.trigger("queue:join", { username: "Host" });
  assert.equal(socket.sent.filter(({ event, payload }) => event === "server:error" && (payload as { code?: string }).code === "ALREADY_SEATED").length, 2);
  assert.equal(socket.sent.filter(({ event }) => event === "room:session").length, 1);
  reset();
});

test("submission acknowledgement confirms only the lock", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  reset();
  const room = createRoom("private", config, "Host");
  attachSeat(room.metadata.roomId, room.seat, "host");
  const guest = joinRoom(room.metadata.roomId, "Guest", "guest");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  const io = new TestIo();
  const hostSocket = new TestSocket("host");
  registerHandlers(asServer(io), asSocket(hostSocket));
  const events = { emit: () => undefined, message: () => undefined };
  ensureMatch(room.metadata.roomId);
  configureMatch(room.metadata.roomId, room.seat.seatId, config, events);
  toggleReady(room.metadata.roomId, room.seat.seatId, events);
  toggleReady(room.metadata.roomId, guest.seat.seatId, events);
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  hostSocket.trigger("match:submit", { questionId, answer: "a" });
  const acknowledgement = hostSocket.sent.find(({ event }) => event === "match:submission-ack")?.payload;
  assert.deepEqual(acknowledgement, { submitted: true });
  reset();
});

test("two disconnected seats resolve to abandoned", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  reset();
  const room = createRoom("private", config, "Host");
  attachSeat(room.metadata.roomId, room.seat, "host");
  const guest = joinRoom(room.metadata.roomId, "Guest", "guest");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  const io = new TestIo();
  const hostSocket = new TestSocket("host");
  const guestSocket = new TestSocket("guest");
  registerHandlers(asServer(io), asSocket(hostSocket));
  registerHandlers(asServer(io), asSocket(guestSocket));
  const events = { emit: () => undefined, message: () => undefined };
  ensureMatch(room.metadata.roomId);
  configureMatch(room.metadata.roomId, room.seat.seatId, config, events);
  toggleReady(room.metadata.roomId, room.seat.seatId, events);
  toggleReady(room.metadata.roomId, guest.seat.seatId, events);
  t.mock.timers.tick(3_000);
  hostSocket.trigger("disconnect");
  t.mock.timers.tick(1);
  guestSocket.trigger("disconnect");
  t.mock.timers.tick(29_999);
  const abandoned = io.broadcasts.find(({ event, payload }) => event === "match:state" && (payload as { phase?: string }).phase === "ABANDONED");
  assert.ok(abandoned);
  assert.equal((abandoned.payload as { winnerSeatId?: string | null }).winnerSeatId, null);
  t.mock.timers.tick(1);
  reset();
});
