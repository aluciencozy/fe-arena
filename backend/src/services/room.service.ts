import { randomUUID } from "node:crypto";
import type { MatchConfig, MatchSource } from "../../../shared/domain.js";

export type RoomSeat = {
  seatId: string;
  name: string;
  reconnectToken: string;
  socketId: string | null;
  connected: boolean;
  /** Set only by a server-verified Auth token; never accepted from room payloads. */
  authUserId?: string;
};

export type RoomMetadata = {
  roomId: string;
  source: MatchSource;
  hostSeatId: string;
  config: MatchConfig;
};

type RoomRecord = { metadata: RoomMetadata; seats: RoomSeat[] };
const rooms = new Map<string, RoomRecord>();
const socketSeats = new Map<string, { roomId: string; seatId: string }>();
const tokenSeats = new Map<string, { roomId: string; seatId: string }>();

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
const normalizeRoomId = (roomId: string) => roomId.trim().toUpperCase();

export const generateRoomId = () => {
  let id = roomCode();
  while (rooms.has(id)) id = roomCode();
  return id;
};

export const createRoom = (source: MatchSource, config: MatchConfig, hostName: string) => {
  const seat: RoomSeat = { seatId: randomUUID(), name: hostName.trim(), reconnectToken: randomUUID(), socketId: null, connected: false };
  const metadata: RoomMetadata = { roomId: generateRoomId(), source, hostSeatId: seat.seatId, config };
  rooms.set(metadata.roomId, { metadata, seats: [seat] });
  tokenSeats.set(seat.reconnectToken, { roomId: metadata.roomId, seatId: seat.seatId });
  return { metadata, seat };
};

export const getRoom = (roomId: string) => rooms.get(normalizeRoomId(roomId));
export const getMetadata = (roomId: string) => getRoom(roomId)?.metadata;
export const getSeats = (roomId: string) => getRoom(roomId)?.seats ?? [];
export const getSeat = (roomId: string, seatId: string) => getRoom(roomId)?.seats.find((seat) => seat.seatId === seatId);
export const bindSeatAuthIdentity = (roomId: string, seatId: string, authUserId: string | undefined) => {
  const seat = getSeat(roomId, seatId);
  if (!seat) return false;
  if (authUserId) seat.authUserId = authUserId;
  else delete seat.authUserId;
  return true;
};
export const getSeatForSocket = (socketId: string) => {
  const location = socketSeats.get(socketId);
  return location ? getSeat(location.roomId, location.seatId) : undefined;
};
export const getRoomForSocket = (socketId: string) => socketSeats.get(socketId)?.roomId;

export const attachSeat = (roomId: string, seat: RoomSeat, socketId: string) => {
  const record = getRoom(roomId);
  if (!record) return false;
  if (seat.socketId) socketSeats.delete(seat.socketId);
  seat.socketId = socketId;
  seat.connected = true;
  socketSeats.set(socketId, { roomId: record.metadata.roomId, seatId: seat.seatId });
  return true;
};

export const joinRoom = (roomIdInput: string, nameInput: string, socketId: string) => {
  const roomId = normalizeRoomId(roomIdInput);
  const record = rooms.get(roomId);
  const name = nameInput.trim();
  if (!record) return { ok: false as const, error: "That room code was not found." };
  const existingSocket = getRoomForSocket(socketId);
  if (existingSocket) return { ok: false as const, error: "This browser is already seated in a match." };
  const sameName = record.seats.find((seat) => seat.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (sameName) return { ok: false as const, error: "That guest name is already in this room." };
  if (record.seats.length >= 2) return { ok: false as const, error: "This private match already has two guests." };
  const seat: RoomSeat = { seatId: randomUUID(), name, reconnectToken: randomUUID(), socketId, connected: true };
  record.seats.push(seat);
  socketSeats.set(socketId, { roomId, seatId: seat.seatId });
  tokenSeats.set(seat.reconnectToken, { roomId, seatId: seat.seatId });
  return { ok: true as const, seat, metadata: record.metadata };
};

export const reconnectRoom = (roomIdInput: string, token: string, socketId: string) => {
  const roomId = normalizeRoomId(roomIdInput);
  const location = tokenSeats.get(token);
  const current = socketSeats.get(socketId);
  if (!location || location.roomId !== roomId || (current && (current.roomId !== roomId || current.seatId !== location.seatId))) return { ok: false as const, error: "That guest seat is no longer available." };
  const seat = getSeat(roomId, location.seatId);
  const metadata = getMetadata(roomId);
  if (!seat || !metadata) return { ok: false as const, error: "That match has expired." };
  if (seat.socketId && seat.socketId !== socketId) return { ok: false as const, error: "That guest seat is connected elsewhere." };
  attachSeat(roomId, seat, socketId);
  return { ok: true as const, seat, metadata };
};

export const disconnectSocket = (socketId: string) => {
  const location = socketSeats.get(socketId);
  if (!location) return null;
  socketSeats.delete(socketId);
  const seat = getSeat(location.roomId, location.seatId);
  if (!seat) return null;
  seat.socketId = null;
  seat.connected = false;
  return { roomId: location.roomId, seat };
};

export const removeSeat = (roomIdInput: string, seatId: string) => {
  const roomId = normalizeRoomId(roomIdInput);
  const record = rooms.get(roomId);
  if (!record) return null;
  const index = record.seats.findIndex((seat) => seat.seatId === seatId);
  if (index < 0) return null;
  const [seat] = record.seats.splice(index, 1);
  if (!seat) return null;
  if (seat.socketId) socketSeats.delete(seat.socketId);
  tokenSeats.delete(seat.reconnectToken);
  if (record.seats.length === 0) rooms.delete(roomId);
  else if (record.metadata.hostSeatId === seatId) record.metadata.hostSeatId = record.seats[0]!.seatId;
  return { roomId, seat, remaining: record.seats };
};

export const removeRoom = (roomIdInput: string) => {
  const roomId = normalizeRoomId(roomIdInput);
  const record = rooms.get(roomId);
  if (!record) return;
  for (const seat of record.seats) {
    if (seat.socketId) socketSeats.delete(seat.socketId);
    tokenSeats.delete(seat.reconnectToken);
  }
  rooms.delete(roomId);
};

export const seatNames = (roomId: string) => getSeats(roomId).map((seat) => seat.name);
export const clearRoomsForTests = () => { rooms.clear(); socketSeats.clear(); tokenSeats.clear(); };
