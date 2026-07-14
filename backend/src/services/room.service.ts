import { randomUUID } from "node:crypto";
import type {
  GameDifficulty,
  GameMode,
  RoomMetadata,
  RoomSource,
} from "../types/index.js";

// Hold the rooms and the players in them
const rooms = new Map<string, string[]>();
const roomMetadata = new Map<string, RoomMetadata>();

// Hold the user sessions to track which socket is in which room and their username
type UserSession = { roomId: string; username: string; reconnectToken: string };
const userSessions = new Map<string, UserSession>();
const reconnectReservations = new Map<string, UserSession>();

// Utility functions to manage rooms and user sessions
export const getUserSession = (socketId: string) => userSessions.get(socketId);
export const getRoomMetadata = (roomId: string) =>
  roomMetadata.get(roomId.trim().toUpperCase());

// Get the list of players in a room, or an empty array if the room doesn't exist
export const getPlayersInRoom = (roomId: string) => rooms.get(roomId) || [];

const makeRoomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
};

export const generateUniqueRoomId = () => {
  let roomId = makeRoomCode();

  while (rooms.has(roomId) || roomMetadata.has(roomId)) {
    roomId = makeRoomCode();
  }

  return roomId;
};

export const createRoom = ({
  mode,
  difficulty = "standard",
  source,
  selectedTitleIds,
}: {
  mode: GameMode;
  difficulty?: GameDifficulty;
  source: RoomSource;
  selectedTitleIds: string[];
}) => {
  const roomId = generateUniqueRoomId();

  rooms.set(roomId, []);
  roomMetadata.set(roomId, {
    roomId,
    mode,
    difficulty,
    source,
    selectedTitleIds,
  });

  return roomMetadata.get(roomId) as RoomMetadata;
};

export const addPlayerToRoom = (
  roomId: string,
  username: string,
  socketId: string,
): { ok: true; currentPlayers: string[]; isNewPlayer: boolean; reconnectToken: string } | { ok: false; error: string } => {
  const normalizedRoomId = roomId.trim().toUpperCase();
  const normalizedUsername = username.trim();
  const existingSession = userSessions.get(socketId);

  if (
    existingSession?.roomId === normalizedRoomId &&
    existingSession.username.toLowerCase() === normalizedUsername.toLowerCase()
  ) {
    return {
      ok: true,
      currentPlayers: rooms.get(normalizedRoomId) || [existingSession.username],
      isNewPlayer: false,
      reconnectToken: existingSession.reconnectToken,
    };
  }

  if (!rooms.has(normalizedRoomId)) {
    return { ok: false, error: "That room code was not found." };
  }

  // If the room exists, add the player to it if they are not already in it
  const players = rooms.get(normalizedRoomId) as string[];

  const matchingPlayer = players.find(
    (player) => player.toLowerCase() === normalizedUsername.toLowerCase(),
  );

  if (matchingPlayer) {
    return { ok: false, error: "That username is already taken in this room." };
  }

  if (players.length >= 2) {
    return { ok: false, error: "This room already has 2 players." };
  }

  players.push(normalizedUsername);
  const reconnectToken = randomUUID();
  userSessions.set(socketId, {
    roomId: normalizedRoomId,
    username: normalizedUsername,
    reconnectToken,
  });
  return { ok: true, currentPlayers: players, isNewPlayer: true, reconnectToken };
};

export const reservePlayerForReconnect = (socketId: string) => {
  const session = userSessions.get(socketId);
  if (!session) return null;
  userSessions.delete(socketId);
  reconnectReservations.set(session.reconnectToken, session);
  return session;
};

export const restorePlayerFromReconnect = (
  reconnectToken: string,
  socketId: string,
  requestedRoomId: string,
) => {
  const session = reconnectReservations.get(reconnectToken);
  if (!session || session.roomId !== requestedRoomId.trim().toUpperCase()) return null;
  reconnectReservations.delete(reconnectToken);
  userSessions.set(socketId, session);
  return session;
};

export const expireReconnectReservation = (reconnectToken: string) => {
  const session = reconnectReservations.get(reconnectToken);
  if (!session) return null;
  reconnectReservations.delete(reconnectToken);
  return removePlayer(session);
};

const removePlayer = ({ roomId, username }: Pick<UserSession, "roomId" | "username">) => {
  const players = rooms.get(roomId) ?? [];
  const updatedPlayers = players.filter((player) => player !== username);
  if (updatedPlayers.length === 0) {
    rooms.delete(roomId);
    roomMetadata.delete(roomId);
  } else {
    rooms.set(roomId, updatedPlayers);
  }
  return { roomId, username, updatedPlayers };
};

export const removePlayerFromRoom = (
  socketId: string,
): { roomId: string; username: string; updatedPlayers: string[] } | null => {
  // Get user's session to find out which room they are in and their username
  const session = getUserSession(socketId);

  if (!session) return null; // Safe check if there's no session for the socket

  // Grab the roomId, username, and current players in the room, then filter out removed player
  userSessions.delete(socketId);
  reconnectReservations.delete(session.reconnectToken);
  return removePlayer(session);
};
