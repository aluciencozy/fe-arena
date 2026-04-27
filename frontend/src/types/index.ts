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
  phase: "LOBBY" | "PLAYING" | "ROUND_END" | "GAME_OVER";
  currentRound: number;
  health: Record<string, number>;
  currentVideoID: string | null;
  videoStartTime: number;
  roundStartTime: number | null;
  setGameState: (newState: Partial<GameState>) => void;
}
