import type { Server, Socket } from "socket.io";
import {
  ChatSchema,
  CreatePrivateSchema,
  JoinRoomSchema,
  MatchConfigSchema,
  QueueJoinSchema,
  ReconnectSchema,
  SubmitSchema,
  SoloStartSchema,
  type QuestionAttempt,
} from "../../../shared/domain.js";
import { createRoom, attachSeat, disconnectSocket, getMetadata, getRoomForSocket, getSeatForSocket, getSeats, joinRoom, reconnectRoom, removeSeat } from "../services/room.service.js";
import { enqueue, dequeue, publicConfig } from "../services/queue.service.js";
import { clearMatch, configureMatch, ensureMatch, getMatchState, leaveMatch, pauseForDisconnect, resumeAfterReconnect, submitAnswer, toggleReady, requestRematch } from "../services/match.service.js";
import { soloNext, soloSubmit, startSolo } from "../services/solo.service.js";

const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const chatTimes = new Map<string, number>();
const ACTIVE_PHASES = new Set(["COUNTDOWN", "QUESTION", "REVEAL", "PAUSED"]);

type SafeSeat = { seatId: string; name: string; connected: boolean };
const safeSeats = (roomId: string): SafeSeat[] => getSeats(roomId).map(({ seatId, name, connected }) => ({ seatId, name, connected }));
const emitRoom = (io: Server, roomId: string) => {
  const metadata = getMetadata(roomId);
  if (!metadata) return;
  io.to(roomId).emit("room:state", { metadata, seats: safeSeats(roomId) });
};
const makeEvents = (io: Server, roomId: string) => ({
  emit: (state: ReturnType<typeof ensureMatch>) => { if (state) io.to(roomId).emit("match:state", state); },
  message: (text: string) => io.to(roomId).emit("chat:message", { type: "system", sender: "FE Arena", text, sentAt: Date.now() }),
});
const error = (socket: Socket, message: string, code = "BAD_REQUEST") => socket.emit("server:error", { code, message });
const session = (socket: Socket) => {
  const seat = getSeatForSocket(socket.id);
  const roomId = getRoomForSocket(socket.id);
  return seat && roomId ? { seat, roomId } : null;
};
const enterRoom = (io: Server, socket: Socket, roomId: string, seat: { seatId: string; name: string; reconnectToken: string }) => {
  socket.join(roomId);
  socket.emit("room:session", { roomId, seatId: seat.seatId, reconnectToken: seat.reconnectToken });
  ensureMatch(roomId);
  emitRoom(io, roomId);
  const state = getMatchState(roomId);
  if (state) socket.emit("match:state", state);
};
const expireDisconnectedSeat = (io: Server, roomId: string, seatId: string, token: string) => {
  reconnectTimers.delete(token);
  const seat = getSeats(roomId).find((candidate) => candidate.seatId === seatId);
  if (!seat || seat.connected) return;
  const state = getMatchState(roomId);
  if (state && ACTIVE_PHASES.has(state.phase)) leaveMatch(roomId, seatId, "expired", makeEvents(io, roomId));
  const removal = removeSeat(roomId, seatId);
  if (!removal) return;
  emitRoom(io, roomId);
  if (removal.remaining.length === 0) clearMatch(roomId);
};
const reserveDisconnectedSeat = (io: Server, roomId: string, seatId: string, token: string) => {
  const oldTimer = reconnectTimers.get(token);
  if (oldTimer) clearTimeout(oldTimer);
  reconnectTimers.set(token, setTimeout(() => expireDisconnectedSeat(io, roomId, seatId, token), 30_000));
};

const validate = (socket: Socket, schema: { safeParse: (value: unknown) => any }, value: unknown): any => {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) { error(socket, "The request shape is invalid."); return null; }
  return result.data;
};

export const registerHandlers = (io: Server, socket: Socket) => {
  socket.on("room:create-private", (payload: unknown) => {
    const input = validate(socket, CreatePrivateSchema, payload);
    if (!input) return;
    const created = createRoom("private", input.config, input.username);
    attachSeat(created.metadata.roomId, created.seat, socket.id);
    enterRoom(io, socket, created.metadata.roomId, created.seat);
    socket.emit("room:created", { roomId: created.metadata.roomId, metadata: created.metadata, seatId: created.seat.seatId, reconnectToken: created.seat.reconnectToken });
  });

  socket.on("room:join", (payload: unknown) => {
    const input = validate(socket, JoinRoomSchema, payload);
    if (!input) return;
    const result = joinRoom(input.roomId, input.username, socket.id);
    if (!result.ok) { error(socket, result.error, "ROOM_NOT_FOUND"); return; }
    enterRoom(io, socket, result.metadata.roomId, result.seat);
    io.to(result.metadata.roomId).emit("chat:message", { type: "system", sender: "FE Arena", text: `${result.seat.name} joined the study room.`, sentAt: Date.now() });
  });

  socket.on("queue:join", (payload: unknown) => {
    const input = validate(socket, QueueJoinSchema, payload);
    if (!input) return;
    const result = enqueue({ socketId: socket.id, username: input.username, queuedAt: Date.now() }, () => socket.emit("queue:state", { status: "expired" }));
    if (result.status === "waiting") { socket.emit("queue:state", { status: "waiting", expiresAt: result.expiresAt }); return; }
    const opponentSocket = io.sockets.sockets.get(result.opponent.socketId);
    if (!opponentSocket) {
      const retry = enqueue({ socketId: socket.id, username: input.username, queuedAt: Date.now() }, () => socket.emit("queue:state", { status: "expired" }));
      if (retry.status === "waiting") socket.emit("queue:state", { status: "waiting", expiresAt: retry.expiresAt });
      return;
    }
    const created = createRoom("public", publicConfig, result.opponent.username);
    attachSeat(created.metadata.roomId, created.seat, result.opponent.socketId);
    const joined = joinRoom(created.metadata.roomId, input.username, socket.id);
    if (!joined.ok) { error(socket, "The public match could not be seated. Try again.", "QUEUE_RETRY"); return; }
    enterRoom(io, opponentSocket, created.metadata.roomId, created.seat);
    enterRoom(io, socket, created.metadata.roomId, joined.seat);
    io.to(created.metadata.roomId).emit("queue:matched", { roomId: created.metadata.roomId, metadata: created.metadata });
    opponentSocket.emit("queue:seat", { roomId: created.metadata.roomId, seatId: created.seat.seatId, reconnectToken: created.seat.reconnectToken });
    socket.emit("queue:seat", { roomId: created.metadata.roomId, seatId: joined.seat.seatId, reconnectToken: joined.seat.reconnectToken });
  });
  socket.on("queue:leave", () => { if (dequeue(socket.id)) socket.emit("queue:state", { status: "cancelled" }); });

  socket.on("room:reconnect", (payload: unknown) => {
    const input = validate(socket, ReconnectSchema, payload);
    if (!input) return;
    const result = reconnectRoom(input.roomId, input.reconnectToken, socket.id);
    if (!result.ok) { socket.emit("room:reconnect-failed", { message: result.error }); return; }
    const timer = reconnectTimers.get(result.seat.reconnectToken);
    if (timer) clearTimeout(timer);
    reconnectTimers.delete(result.seat.reconnectToken);
    enterRoom(io, socket, result.metadata.roomId, result.seat);
    resumeAfterReconnect(result.metadata.roomId, makeEvents(io, result.metadata.roomId));
    emitRoom(io, result.metadata.roomId);
  });

  socket.on("room:state-request", () => {
    const current = session(socket);
    if (!current) return error(socket, "Join a room first.", "NOT_SEATED");
    emitRoom(io, current.roomId);
    const state = getMatchState(current.roomId);
    if (state) socket.emit("match:state", state);
  });

  socket.on("match:configure", (payload: unknown) => {
    const current = session(socket);
    if (!current) return error(socket, "Join a room first.", "NOT_SEATED");
    const input = validate(socket, MatchConfigSchema, payload);
    if (!input) return;
    if (getMetadata(current.roomId)?.source !== "private") return error(socket, "Public queue settings are fixed by the server.", "PUBLIC_SETTINGS");
    const result = configureMatch(current.roomId, current.seat.seatId, input, makeEvents(io, current.roomId));
    if (!result.ok) error(socket, result.error, "CONFIGURATION_ERROR");
  });
  socket.on("match:ready", () => {
    const current = session(socket);
    if (!current) return error(socket, "Join a room first.", "NOT_SEATED");
    const result = toggleReady(current.roomId, current.seat.seatId, makeEvents(io, current.roomId));
    if (!result.ok) error(socket, result.error, "READY_ERROR");
  });
  socket.on("match:submit", (payload: unknown) => {
    const current = session(socket);
    if (!current) return error(socket, "Join a room first.", "NOT_SEATED");
    const input = validate(socket, SubmitSchema, payload) as QuestionAttempt | null;
    if (!input) return;
    const result = submitAnswer(current.roomId, current.seat.seatId, input, makeEvents(io, current.roomId));
    if (!result.ok) error(socket, result.error, "SUBMISSION_ERROR");
    else socket.emit("match:submission-ack", { correct: result.correct, score: result.score });
  });
  socket.on("match:rematch", () => {
    const current = session(socket);
    if (!current) return error(socket, "Join a room first.", "NOT_SEATED");
    const result = requestRematch(current.roomId, current.seat.seatId, makeEvents(io, current.roomId));
    if (!result.ok) error(socket, result.error, "REMATCH_ERROR");
  });

  socket.on("chat:send", (payload: unknown) => {
    const current = session(socket);
    if (!current) return error(socket, "Join a room first.", "NOT_SEATED");
    const input = validate(socket, ChatSchema, payload);
    if (!input) return;
    const now = Date.now();
    if (now - (chatTimes.get(socket.id) ?? 0) < 1000) return error(socket, "Chat is limited to one message per second.", "CHAT_RATE_LIMIT");
    chatTimes.set(socket.id, now);
    io.to(current.roomId).emit("chat:message", { type: "user", sender: current.seat.name, text: input.message, sentAt: now });
  });

  socket.on("solo:start", (payload: unknown) => {
    const input = validate(socket, SoloStartSchema, payload);
    if (!input) return;
    startSolo(socket.id, input.topicIds, input.count, input.timerSeconds, (state) => socket.emit("solo:state", state));
  });
  socket.on("solo:submit", (payload: unknown) => {
    const input = validate(socket, SubmitSchema, payload) as QuestionAttempt | null;
    if (!input) return;
    const result = soloSubmit(socket.id, input, (state) => socket.emit("solo:state", state));
    if (!result.ok) error(socket, result.error, "SOLO_SUBMISSION_ERROR");
  });
  socket.on("solo:next", () => { if (!soloNext(socket.id, (state) => socket.emit("solo:state", state))) error(socket, "Finish the current practice result first.", "SOLO_STATE_ERROR"); });

  socket.on("room:leave", () => {
    const current = session(socket);
    if (!current) return;
    const state = getMatchState(current.roomId);
    if (state && ACTIVE_PHASES.has(state.phase)) leaveMatch(current.roomId, current.seat.seatId, "forfeit", makeEvents(io, current.roomId));
    const removal = removeSeat(current.roomId, current.seat.seatId);
    socket.leave(current.roomId);
    if (removal) { emitRoom(io, current.roomId); if (!removal.remaining.length) clearMatch(current.roomId); }
  });

  socket.on("disconnect", () => {
    dequeue(socket.id);
    chatTimes.delete(socket.id);
    const current = session(socket);
    if (!current) return;
    const detached = disconnectSocket(socket.id);
    if (!detached) return;
    const state = getMatchState(current.roomId);
    if (state && ACTIVE_PHASES.has(state.phase)) pauseForDisconnect(current.roomId, current.seat.seatId, makeEvents(io, current.roomId));
    emitRoom(io, current.roomId);
    reserveDisconnectedSeat(io, current.roomId, current.seat.seatId, current.seat.reconnectToken);
  });
};
