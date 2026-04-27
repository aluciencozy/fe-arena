import type { GameState } from "../types/index.js";

// Hold the active games
const activeGames = new Map<string, GameState>();

export const createGame = (roomId: string, gameState: GameState) => {
  activeGames.set(roomId, gameState);
};
