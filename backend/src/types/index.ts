export interface GameState {
  phase: "LOBBY" | "PLAYING" | "ROUND_END" | "GAME_OVER" | "GRACE_PERIOD";
  currentRound: number;
  health: Record<string, number>;
  pendingDamage: Record<string, number>;
  currentVideoID: string | null;
  videoStartTime: number;
  roundStartTime: number | null;
  guessedCorrectly: string[];
  roundTimer?: NodeJS.Timeout;
}
