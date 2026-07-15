export interface UnifiedMessage {
  id: string;
  type: "SYSTEM" | "USER";
  sender?: string;
  text: string;
  timestamp: number;
}

export type GameMode = "anime" | "video-game";
export type { AnimePlaylist, AnimeTrackCategory } from "../../../shared/playlist";
import type { AnimeTrackCategory } from "../../../shared/playlist";
export type RoomSource = "private" | "queue";

export interface AnswerAlias {
  value: string;
  match: "exact" | "fuzzy";
}

export interface AnswerOption {
  id: string;
  canonicalTitle: string;
  romajiName: string | null;
  nativeName: string | null;
  coverImageUrl: string;
  searchTerms: string[];
}

export interface CatalogTrack {
  id: string;
  videoId: string;
  title?: string;
  durationSeconds?: number;
  easyModeRank?: number;
  category: AnimeTrackCategory;
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

export interface RoundResult {
  canonicalTitle: string;
  trackTitle: string | null;
  titleId: string;
  romajiName: string | null;
  nativeName: string | null;
  damageByPlayer: Record<string, number>;
  damageDealt: number;
  damagedPlayer: string | null;
  winner: string | null;
  isTie: boolean;
}

export interface RoomMetadata {
  roomId: string;
  mode: GameMode;
  playlist: AnimePlaylist;
  source: RoomSource;
  selectedTitleIds: string[];
}

export interface PlayerState {
  playerName: string;
  volume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
  setPlayerName: (name: string) => void;
  setVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setMusicMuted: (muted: boolean) => void;
  setSfxMuted: (muted: boolean) => void;
}

export interface GameState {
  playlist: AnimePlaylist;
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
  firstGuessStreaks: Record<string, number>;
  skipVotes: string[];
  ready: Record<string, boolean>;
  winner: string | null;
  revealedAnswer: string | null;
  roundResult: RoundResult | null;
  matchHistory: RoundResult[];
  playlistIndex: number;
  answerOptions: AnswerOption[];
  connectionPause: {
    playerName: string;
    expiresAt: number;
  } | null;
}

export interface GameStore extends GameState {
  setGameState: (newState: Partial<GameState>) => void;
}
