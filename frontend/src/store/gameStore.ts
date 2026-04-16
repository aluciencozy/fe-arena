import { create } from 'zustand';

// Shape of global player state
interface PlayerState {
  playerName: string;
  setPlayerName: (name: string) => void;
}

// Create a global store using Zustand to manage player information across the app
export const useGameStore = create<PlayerState>((set) => ({
  // Initial state for the player's name and a function to update it
  playerName: '',
  setPlayerName: (name: string) => set({ playerName: name }),
}));