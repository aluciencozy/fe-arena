import { create } from "zustand";
import type { MatchPublicState, RoomState } from "@/types";

const NAME_KEY = "fe-arena-guest-name";
const TOKEN_KEY = "fe-arena-seat-token";
const DEFAULT_NAME = "";
const readName = () =>
  typeof window === "undefined" ? DEFAULT_NAME : (window.localStorage.getItem(NAME_KEY) ?? DEFAULT_NAME);

export type AppStore = {
  playerName: string;
  room: RoomState | null;
  match: MatchPublicState | null;
  seatId: string | null;
  reconnectToken: string | null;
  setPlayerName: (name: string) => void;
  setRoom: (room: RoomState) => void;
  setMatch: (match: MatchPublicState) => void;
  setSession: (seatId: string, token: string, roomId: string) => void;
  clearSession: () => void;
};
const tokenFor = (roomId: string) =>
  typeof window === "undefined" ? null : window.sessionStorage.getItem(`${TOKEN_KEY}:${roomId}`);
export const storedTokenForRoom = tokenFor;

export const useGameStore = create<AppStore>((set) => ({
  playerName: readName(),
  room: null,
  match: null,
  seatId: null,
  reconnectToken: null,
  setPlayerName: (name) => {
    const normalized = name.trim().slice(0, 24);
    if (typeof window !== "undefined") window.localStorage.setItem(NAME_KEY, normalized);
    set({ playerName: normalized });
  },
  setRoom: (room) => set({ room }),
  setMatch: (match) => set({ match }),
  setSession: (seatId, token, roomId) => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(`${TOKEN_KEY}:${roomId}`, token);
    set({ seatId, reconnectToken: token });
  },
  clearSession: () => set({ seatId: null, reconnectToken: null, room: null, match: null }),
}));

export const clearStoredToken = (roomId: string) => {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(`${TOKEN_KEY}:${roomId}`);
};
