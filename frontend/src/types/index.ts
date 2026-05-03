export interface UnifiedMessage {
  id: string;
  type: "SYSTEM" | "USER";
  sender?: string;
  text: string;
  timestamp: number;
}

export interface PlayerState {
  playerName: string;
  setPlayerName: (name: string) => void;
}

export interface GameState {
  phase: "LOBBY" | "PLAYING" | "ROUND_END" | "GAME_OVER" | "GRACE_PERIOD";
  currentRound: number;
  health: Record<string, number>;
  pendingDamage: Record<string, number>;
  currentVideoID: string | null;
  videoStartTime: number;
  roundStartTime: number | null;
  guessedCorrectly: string[];
}

export interface GameStore extends GameState {
  setGameState: (newState: Partial<GameState>) => void;
}
