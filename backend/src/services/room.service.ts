import type { GameMode, RoomMetadata, RoomSource } from "../types/index.js";

// Hold the rooms and the players in them
const rooms = new Map<string, string[]>();
const roomMetadata = new Map<string, RoomMetadata>();

// Hold the user sessions to track which socket is in which room and their username
const userSessions = new Map<string, { roomId: string; username: string }>();

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
  source,
  selectedTitleIds,
}: {
  mode: GameMode;
  source: RoomSource;
  selectedTitleIds: string[];
}) => {
  const roomId = generateUniqueRoomId();

  rooms.set(roomId, []);
  roomMetadata.set(roomId, {
    roomId,
    mode,
    source,
    selectedTitleIds,
  });

  return roomMetadata.get(roomId) as RoomMetadata;
};

export const addPlayerToRoom = (
  roomId: string,
  username: string,
  socketId: string,
): { ok: true; currentPlayers: string[]; isNewPlayer: boolean } | { ok: false; error: string } => {
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
  userSessions.set(socketId, {
    roomId: normalizedRoomId,
    username: normalizedUsername,
  });
  return { ok: true, currentPlayers: players, isNewPlayer: true };
};

export const removePlayerFromRoom = (
  socketId: string,
): { roomId: string; username: string; updatedPlayers: string[] } | null => {
  // Get user's session to find out which room they are in and their username
  const session = getUserSession(socketId);

  if (!session) return null; // Safe check if there's no session for the socket

  // Grab the roomId, username, and current players in the room, then filter out removed player
  const { roomId, username } = session;
  const players = rooms.get(roomId) as string[];
  const updatedPlayers = players.filter((player) => player !== username);

  // If the room is empty after removing the player, delete the room, otherwise update the room with the new list of players
  if (updatedPlayers.length === 0) {
    rooms.delete(roomId);
    roomMetadata.delete(roomId);
  } else {
    rooms.set(roomId, updatedPlayers);
  }

  userSessions.delete(socketId); // Remove the user's session

  return { roomId, username, updatedPlayers };
};
