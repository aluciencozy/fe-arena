// Hold the rooms and the players in them
const rooms = new Map<string, string[]>();

export const addPlayerToRoom = (
  roomId: string,
  username: string,
): { currentPlayers: string[]; isNewPlayer: boolean } => {
  // If the room doesn't exist, create it and add the player to it
  if (!rooms.has(roomId))
    return {
      currentPlayers: rooms.set(roomId, [username]).get(roomId) as string[],
      isNewPlayer: true,
    };

  // If the room exists, add the player to it if they are not already in it
  const players = rooms.get(roomId) as string[];

  if (players.find((player) => player === username))
    return { currentPlayers: players, isNewPlayer: false };

  players.push(username);
  return { currentPlayers: players, isNewPlayer: true };
};
