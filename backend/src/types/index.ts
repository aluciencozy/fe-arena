export interface GameState {
  phase: "LOBBY" | "PLAYING" | "ROUND_END" | "GAME_OVER";
  currentRound: number;
  health: Record<string, number>;
  currentVideoID: string | null;
  videoStartTime: number;
  roundStartTime: number | null;
}
