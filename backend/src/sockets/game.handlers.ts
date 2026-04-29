import { Server, Socket } from "socket.io";
import { getUserSession, getPlayersInRoom } from "../services/room.service.js";
import type { GameState } from "../types/index.js";
import { createGame } from "../services/game.service.js";

export const registerGameHandler = (io: Server, socket: Socket) => {
  socket.on("chat:message", (message: string) => {
    const session = getUserSession(socket.id);

    if (!session) return; // If there's no session for the socket, do nothing

    const { roomId, username } = session;

    // Broadcast the chat message to all users in the room, including the sender
    io.to(roomId).emit("chat:broadcast", { username, message });
  });

  socket.on("game:start", () => {
    const session = getUserSession(socket.id);

    if (!session) return; // If there's no session for the socket, do nothing

    const { roomId } = session;

    const players = getPlayersInRoom(roomId);

    if (players.length < 2) {
      socket.emit(
        "game:error",
        "At least 2 players are required to start the game.",
      );
      return;
    }

    const healthValues: Record<string, number> = {};
    players.forEach((player) => {
      healthValues[player] = 5000; // Start with 5000 health for each player
    });

    // Initialize the game state
    const gameState: GameState = {
      phase: "PLAYING",
      currentRound: 0,
      health: healthValues, // Start with 5000 health for each player
      currentVideoID: "B5UUcVGqBDE",
      videoStartTime: 0,
      roundStartTime: Date.now(),
    };

    createGame(roomId, gameState);

    io.to(roomId).emit("game:state", gameState);
  });
};
