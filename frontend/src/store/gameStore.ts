import { create } from "zustand";
import type { PlayerState, GameStore, GameState } from "../types";

// Create a global store using Zustand to manage player information across the app
export const useGameStore = create<PlayerState>((set) => ({
  // Initial state for the player's name and a function to update it
  playerName: "",
  setPlayerName: (name: string) => set({ playerName: name }),
}));

export const useGameStateStore = create<GameStore>((set) => ({
  phase: "LOBBY",
  currentRound: 0,
  health: {},
  pendingDamage: {},
  currentVideoID: null,
  videoStartTime: 0,
  roundStartTime: null,
  countdownEndsAt: null,
  roundEndsAt: null,
  guessedCorrectly: [],
  ready: {},
  winner: null,
  revealedAnswer: null,
  playlistIndex: 0,
  setGameState: (newState: Partial<GameState>) =>
    set((state) => ({ ...state, ...newState })),
}));
