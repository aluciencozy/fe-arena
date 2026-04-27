import { create } from "zustand";
import type { PlayerState, GameState } from "../types";

// Create a global store using Zustand to manage player information across the app
export const useGameStore = create<PlayerState>((set) => ({
  // Initial state for the player's name and a function to update it
  playerName: "",
  setPlayerName: (name: string) => set({ playerName: name }),
}));

export const useGameStateStore = create<GameState>((set) => ({
  phase: "LOBBY",
  currentRound: 0,
  health: {},
  currentVideoID: null,
  videoStartTime: 0,
  roundStartTime: null,
  setGameState: (newState: Partial<GameState>) =>
    set((state) => ({ ...state, ...newState })),
}));
