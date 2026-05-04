import { Server } from "socket.io";
import type { GameState } from "../types/index.js";

// Hold the active games
const activeGames = new Map<string, GameState>();

// Temporary sample playlist with video IDs and their corresponding answers
export const PLAYLIST = [
  { videoId: "B5UUcVGqBDE", answer: "attack on titan" },
  { videoId: "j6eA1_K7fO0", answer: "naruto" },
];

// Create a new game
export const createGame = (roomId: string, gameState: GameState) => {
  activeGames.set(roomId, gameState);
};

// Get the game state for a specific room
export const getGameState = (roomId: string): GameState | undefined => {
  return activeGames.get(roomId);
};

export const startRoundTimer = (roomId: string, io: Server) => {
  const gameState = getGameState(roomId);
  if (!gameState) return;

  if (gameState.roundTimer) clearTimeout(gameState.roundTimer); // Clear any existing timer

  gameState.roundTimer = setTimeout(() => {
    if (gameState.phase === "PLAYING") {
      gameState.phase = "ROUND_END";
      io.to(roomId).emit("game:state", gameState);
      io.to(roomId).emit("chat:broadcast", {
        username: "System",
        message: `Times up! The correct answer was: ${
          PLAYLIST.find((video) => video.videoId === gameState.currentVideoID)?.answer
        }`,
        type: "SYSTEM",
      });

      setTimeout(() => {
        gameState.currentRound += 1;
        gameState.roundStartTime = Date.now();
        gameState.guessedCorrectly = [];
        gameState.pendingDamage = {};
        gameState.phase = "PLAYING";
        gameState.currentVideoID =
          PLAYLIST[gameState.currentRound % PLAYLIST.length]!.videoId;

        io.to(roomId).emit("game:state", gameState);

        startRoundTimer(roomId, io); // Start the round timer for the new round
      }, 2000); // Short delay before starting the next round or ending the game to allow clients to update their UI
    }
  }, 30000); // 30 seconds for each round
};
