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
  phase:
    | "LOBBY"
    | "COUNTDOWN"
    | "PLAYING"
    | "ROUND_END"
    | "GAME_OVER"
    | "GRACE_PERIOD"
    | "REVEAL";
  currentRound: number;
  health: Record<string, number>;
  pendingDamage: Record<string, number>;
  currentVideoID: string | null;
  videoStartTime: number;
  roundStartTime: number | null;
  countdownEndsAt: number | null;
  roundEndsAt: number | null;
  guessedCorrectly: string[];
  ready: Record<string, boolean>;
  winner: string | null;
  revealedAnswer: string | null;
  playlistIndex: number;
}

export interface GameStore extends GameState {
  setGameState: (newState: Partial<GameState>) => void;
}
