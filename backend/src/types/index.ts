export interface GameState {
  phase:
    | "LOBBY"
    | "INTRO_ANIMATION"
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
