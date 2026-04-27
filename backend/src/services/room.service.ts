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
): { currentPlayers: string[]; isNewPlayer: boolean } => {
  // If the room doesn't exist, create it and add the player to it
  if (!rooms.has(roomId)) {
    userSessions.set(socketId, { roomId, username });
    return {
      currentPlayers: rooms.set(roomId, [username]).get(roomId) as string[],
      isNewPlayer: true,
    };
  }

  // If the room exists, add the player to it if they are not already in it
  const players = rooms.get(roomId) as string[];

  if (players.find((player) => player === username)) {
    // Update session for the socket in case the same user is reconnecting with a different socket
    userSessions.set(socketId, { roomId, username });
    return { currentPlayers: players, isNewPlayer: false };
  }

  players.push(username);
  userSessions.set(socketId, { roomId, username });
  return { currentPlayers: players, isNewPlayer: true };
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
