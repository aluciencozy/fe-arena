export type GameMode = "anime" | "video-game";
export type RoomSource = "private" | "queue";

export interface AnswerAlias {
  value: string;
  match: "exact" | "fuzzy";
}

export interface AnswerOption {
  id: string;
  canonicalTitle: string;
  searchTerms: string[];
}

export interface CatalogTrack {
  id: string;
  videoId: string;
  title?: string;
  durationSeconds?: number;
}

export interface CatalogTitle {
  id: string;
  mode: GameMode;
  name: string;
  canonicalTitle: string;
  romajiName?: string | null;
  nativeName?: string | null;
  coverImageUrl: string;
  answerAliases: AnswerAlias[];
  tracks: CatalogTrack[];
}

export interface RoomMetadata {
  roomId: string;
  mode: GameMode;
  source: RoomSource;
  selectedTitleIds: string[];
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
  currentVideoDurationSeconds: number | null;
  roundStartTime: number | null;
  countdownEndsAt: number | null;
  roundEndsAt: number | null;
  guessedCorrectly: string[];
  ready: Record<string, boolean>;
  winner: string | null;
  revealedAnswer: string | null;
  playlistIndex: number;
  answerOptions: AnswerOption[];
}
