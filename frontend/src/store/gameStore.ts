import { create } from "zustand";
import type { PlayerState, GameStore, GameState } from "../types";

const DEFAULT_VOLUME = 35;
const VOLUME_STORAGE_KEY = "guess-the-ost-volume";
const USERNAME_STORAGE_KEY = "guess-the-ost-username";

const clampVolume = (volume: number) => {
  if (!Number.isFinite(volume)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(100, volume));
};

const getStoredVolume = () => {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const storedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
  if (storedVolume === null) return DEFAULT_VOLUME;
  return clampVolume(Number(storedVolume));
};

const getStoredUsername = () => {
  if (typeof window === "undefined") return "";
  const storedUsername = window.localStorage.getItem(USERNAME_STORAGE_KEY);
  if (storedUsername === null) return "";

  const normalizedUsername = storedUsername.trim().slice(0, 18);
  if (normalizedUsername !== storedUsername) {
    window.localStorage.setItem(USERNAME_STORAGE_KEY, normalizedUsername);
  }

  return normalizedUsername;
};

const normalizeUsername = (name: string) => name.trim().slice(0, 18);

export const useGameStore = create<PlayerState>((set) => ({
  playerName: getStoredUsername(),
  volume: getStoredVolume(),
  setPlayerName: (name: string) => {
    const normalizedUsername = normalizeUsername(name);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(USERNAME_STORAGE_KEY, normalizedUsername);
    }
    set({ playerName: normalizedUsername });
  },
  setVolume: (volume: number) => {
    const clampedVolume = clampVolume(volume);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clampedVolume));
    }
    set({ volume: clampedVolume });
  },
}));

export const useGameStateStore = create<GameStore>((set) => ({
  phase: "LOBBY",
  currentRound: 0,
  health: {},
  pendingDamage: {},
  currentVideoID: null,
  videoStartTime: 0,
  currentVideoDurationSeconds: null,
  roundStartTime: null,
  countdownEndsAt: null,
  roundEndsAt: null,
  guessedCorrectly: [],
  firstGuessStreaks: {},
  skipVotes: [],
  ready: {},
  winner: null,
  revealedAnswer: null,
  roundResult: null,
  matchHistory: [],
  playlistIndex: 0,
  answerOptions: [],
  setGameState: (newState: Partial<GameState>) =>
    set((state) => ({ ...state, ...newState })),
}));
