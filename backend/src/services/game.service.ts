import type { GameState } from "../types/index.js";

// Hold the active games
const activeGames = new Map<string, GameState>();

// Create a new game
export const createGame = (roomId: string, gameState: GameState) => {
  activeGames.set(roomId, gameState);
};

// Get the game state for a specific room
export const getGameState = (roomId: string): GameState | undefined => {
  return activeGames.get(roomId);
};
