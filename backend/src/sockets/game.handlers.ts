import { Server, Socket } from "socket.io";
import { getUserSession, getPlayersInRoom } from "../services/room.service.js";
import type { GameState } from "../types/index.js";
import { createGame, getGameState } from "../services/game.service.js";

export const registerGameHandler = (io: Server, socket: Socket) => {
  socket.on("chat:message", (message: string) => {
    const session = getUserSession(socket.id);

    if (!session) return; // If there's no session for the socket, do nothing

    const { roomId, username } = session;

    const gameState = getGameState(roomId);
    const playersInRoom = getPlayersInRoom(roomId);
    const opponent = playersInRoom.find((player) => player !== username);

    // If the game is active and there's an opponent, check if the message is a correct guess
    if (
      gameState &&
      opponent &&
      gameState.health[opponent] &&
      gameState.phase === "PLAYING"
    ) {
      // Check if the message is incorrect (case-insensitive, ignoring leading/trailing whitespace)
      if (message.trim().toLowerCase() !== "attack on titan") {
        // If the message is not the correct guess, send the chat message as a normal user message
        io.to(roomId).emit("chat:broadcast", { username, message });
        return;
      }

      // Calculate damage based on how long the round has been going on, with a minimum of 100 damage and a maximum of 1000 damage
      const elapsedSeconds = Math.floor(
        (Date.now() - gameState.roundStartTime!) / 1000,
      );
      const damage = Math.max(100, 1000 - elapsedSeconds);
      gameState.health[opponent] = Math.max(
        0,
        gameState.health[opponent] - damage,
      );

      io.to(roomId).emit("game:state", gameState);
      io.to(roomId).emit("chat:broadcast", {
        username: "SYSTEM",
        message: `${username} guessed correctly for ${damage} damage!`,
        type: "SYSTEM",
      });

      return;
    }

    // If the game is not active or there's no opponent, just broadcast the chat message without checking for guesses
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
