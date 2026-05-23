// Hold the rooms and the players in them
const rooms = new Map<string, string[]>();

// Hold the user sessions to track which socket is in which room and their username
const userSessions = new Map<string, { roomId: string; username: string }>();

// Utility functions to manage rooms and user sessions
export const getUserSession = (socketId: string) => userSessions.get(socketId);

// Get the list of players in a room, or an empty array if the room doesn't exist
export const getPlayersInRoom = (roomId: string) => rooms.get(roomId) || [];

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

  // If the room doesn't exist, create it and add the player to it
  if (!rooms.has(normalizedRoomId)) {
    userSessions.set(socketId, {
      roomId: normalizedRoomId,
      username: normalizedUsername,
    });
    return {
      ok: true,
      currentPlayers: rooms
        .set(normalizedRoomId, [normalizedUsername])
        .get(normalizedRoomId) as string[],
      isNewPlayer: true,
    };
  }

  // If the room exists, add the player to it if they are not already in it
  const players = rooms.get(normalizedRoomId) as string[];

  if (
    players.some(
      (player) => player.toLowerCase() === normalizedUsername.toLowerCase(),
    )
  ) {
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
  } else {
    rooms.set(roomId, updatedPlayers);
  }

  userSessions.delete(socketId); // Remove the user's session

  return { roomId, username, updatedPlayers };
};
