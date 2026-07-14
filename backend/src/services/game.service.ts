import type {
  AnswerAlias,
  AnswerOption,
  CatalogTitle,
  GameDifficulty,
  GameState,
  RoundResult,
} from "../types/index.js";
import { getRoomMetadata } from "./room.service.js";
import {
  getAnswerOptionsForTitles,
  getTracksForDifficulty,
  getPlayableTitlesForMode,
  getTitlesForTitleIds,
} from "../data/catalog.js";
import { COUNTDOWN_SECONDS } from "../../../shared/game.constants.js";

const ROUND_SECONDS = 30;
const GRACE_SECONDS = 5;
const REVEAL_SECONDS = 6;
const STARTING_HEALTH = 5000;

type TimerHandle = ReturnType<typeof setTimeout>;
export type PlaylistTrack = {
  id: string;
  videoId: string;
  title?: string;
  durationSeconds?: number;
  titleId: string;
  canonicalTitle: string;
  romajiName?: string | null;
  nativeName?: string | null;
  answerAliases: AnswerAlias[];
};

interface GameRecord {
  state: GameState;
  playlist: PlaylistTrack[];
  countdownTimer: TimerHandle | undefined;
  roundTimer: TimerHandle | undefined;
  graceTimer: TimerHandle | undefined;
  revealTimer: TimerHandle | undefined;
  pausedAt: number | null;
  pausedRemainingMs: number | null;
  phaseDeadlineAt: number | null;
}

interface GameEvents {
  emitState: (state: GameState) => void;
  emitSystemMessage: (message: string) => void;
}

const games = new Map<string, GameRecord>();

const createHealth = (players: string[]) =>
  players.reduce<Record<string, number>>((health, player) => {
    health[player] = STARTING_HEALTH;
    return health;
  }, {});

const createReady = (players: string[], readyValue = false) =>
  players.reduce<Record<string, boolean>>((ready, player) => {
    ready[player] = readyValue;
    return ready;
  }, {});

const createStreaks = (players: string[]) =>
  players.reduce<Record<string, number>>((streaks, player) => {
    streaks[player] = 0;
    return streaks;
  }, {});

const getTitlesForRoom = (roomId: string) => {
  const metadata = getRoomMetadata(roomId);

  if (!metadata || metadata.mode === "video-game") return [];

  if (metadata.source === "private") {
    return getTitlesForTitleIds(
      metadata.mode,
      metadata.selectedTitleIds,
      metadata.difficulty,
    );
  }

  return getPlayableTitlesForMode(metadata.mode, metadata.difficulty);
};

const getDifficultyForRoom = (roomId: string): GameDifficulty =>
  getRoomMetadata(roomId)?.difficulty ?? "standard";

const getAnswerOptionsForRoom = (roomId: string): AnswerOption[] =>
  getAnswerOptionsForTitles(getTitlesForRoom(roomId));

const shufflePlaylist = <T>(playlist: T[], random = Math.random) => {
  const shuffled = [...playlist];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }

  return shuffled;
};

export const buildBalancedPlaylist = (
  groups: PlaylistTrack[][],
  random = Math.random,
) => {
  const shuffledGroups = groups
    .filter((group) => group.length > 0)
    .map((group) => shufflePlaylist(group, random));
  const slotsPerGroup = Math.max(
    0,
    ...shuffledGroups.map((group) => group.length),
  );
  const playlist: PlaylistTrack[] = [];

  // Preserve every track while giving every anime the same number of slots.
  // Shorter pools intentionally sample with replacement to keep that balance.
  for (let round = 0; round < slotsPerGroup; round += 1) {
    for (const group of shufflePlaylist(shuffledGroups, random)) {
      playlist.push(group[round % group.length]!);
    }
  }

  return playlist;
};

const toPlaylistTrack = (
  title: CatalogTitle,
  track: CatalogTitle["tracks"][number],
): PlaylistTrack => ({
  ...track,
  titleId: title.id,
  canonicalTitle: title.canonicalTitle,
  romajiName: title.romajiName ?? null,
  nativeName: title.nativeName ?? null,
  answerAliases: title.answerAliases,
});

const getPlaylistForRoom = (roomId: string): PlaylistTrack[] => {
  const difficulty = getDifficultyForRoom(roomId);
  const groups = getTitlesForRoom(roomId).map((title) =>
    getTracksForDifficulty(title, difficulty).map((track) =>
      toPlaylistTrack(title, track),
    ),
  );

  return buildBalancedPlaylist(groups);
};

const getCurrentPlaylistItem = (record: GameRecord) =>
  record.playlist[record.state.playlistIndex % record.playlist.length]!;

const getVideoDurationSeconds = (track: PlaylistTrack) => {
  const durationSeconds = track.durationSeconds;
  return typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
    ? durationSeconds
    : null;
};

const getRandomVideoStartTime = (track: PlaylistTrack) => {
  const durationSeconds = getVideoDurationSeconds(track);
  return durationSeconds === null ? 0 : Math.random() * durationSeconds;
};

const createRoundResult = (
  track: PlaylistTrack,
  damageByPlayer: Record<string, number>,
  damageDealt = 0,
  damagedPlayer: string | null = null,
  winner: string | null = null,
): RoundResult => ({
  canonicalTitle: track.canonicalTitle,
  trackTitle: track.title ?? null,
  titleId: track.titleId,
  romajiName: track.romajiName ?? null,
  nativeName: track.nativeName ?? null,
  damageByPlayer: { ...damageByPlayer },
  damageDealt,
  damagedPlayer,
  winner,
  isTie: damageDealt === 0,
});

const recordRoundResult = (record: GameRecord, result: RoundResult) => {
  record.state.roundResult = result;
  record.state.matchHistory.push(result);
};

const clearTimers = (record: GameRecord) => {
  if (record.countdownTimer) clearTimeout(record.countdownTimer);
  if (record.roundTimer) clearTimeout(record.roundTimer);
  if (record.graceTimer) clearTimeout(record.graceTimer);
  if (record.revealTimer) clearTimeout(record.revealTimer);
  record.countdownTimer = undefined;
  record.roundTimer = undefined;
  record.graceTimer = undefined;
  record.revealTimer = undefined;
};

const makeInitialState = (
  players: string[],
  answerOptions: AnswerOption[] = [],
  difficulty: GameDifficulty = "standard",
): GameState => ({
  difficulty,
  phase: "LOBBY",
  currentRound: 0,
  health: createHealth(players),
  pendingDamage: {},
  currentVideoID: null,
  videoStartTime: 0,
  currentVideoDurationSeconds: null,
  roundStartTime: null,
  countdownEndsAt: null,
  roundEndsAt: null,
  guessedCorrectly: [],
  firstGuessStreaks: createStreaks(players),
  skipVotes: [],
  ready: createReady(players),
  winner: null,
  revealedAnswer: null,
  roundResult: null,
  matchHistory: [],
  playlistIndex: 0,
  answerOptions,
  connectionPause: null,
});

const syncPlayersForLobby = (state: GameState, players: string[]) => {
  const playerSet = new Set(players);

  for (const player of Object.keys(state.ready)) {
    if (!playerSet.has(player)) delete state.ready[player];
  }

  for (const player of Object.keys(state.health)) {
    if (!playerSet.has(player)) delete state.health[player];
  }

  for (const player of players) {
    state.ready[player] ??= false;
    state.health[player] ??= STARTING_HEALTH;
  }
};

const startCountdown = (
  roomId: string,
  players: string[],
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record) return;

  clearTimers(record);

  const now = Date.now();
  record.state.phase = "COUNTDOWN";
  record.state.countdownEndsAt = now + COUNTDOWN_SECONDS * 1000;
  record.phaseDeadlineAt = record.state.countdownEndsAt;
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  const currentVideo = getCurrentPlaylistItem(record);
  record.state.currentVideoID = currentVideo.videoId;
  record.state.currentVideoDurationSeconds = getVideoDurationSeconds(currentVideo);
  record.state.revealedAnswer = null;
  record.state.roundResult = null;
  record.state.guessedCorrectly = [];
  record.state.skipVotes = [];
  record.state.pendingDamage = {};
  record.state.answerOptions = getAnswerOptionsForRoom(roomId);
  record.state.ready = createReady(players, true);

  events.emitState(record.state);

  record.countdownTimer = setTimeout(() => {
    startRound(roomId, events);
  }, COUNTDOWN_SECONDS * 1000);
};

const startRound = (roomId: string, events: GameEvents) => {
  const record = games.get(roomId);
  if (!record || record.state.phase !== "COUNTDOWN") return;

  clearTimers(record);

  const now = Date.now();
  const currentVideo = getCurrentPlaylistItem(record);
  record.state.phase = "PLAYING";
  record.state.currentVideoID = currentVideo.videoId;
  record.state.videoStartTime = getRandomVideoStartTime(currentVideo);
  record.state.currentVideoDurationSeconds = getVideoDurationSeconds(currentVideo);
  record.state.roundStartTime = now;
  record.state.roundEndsAt = now + ROUND_SECONDS * 1000;
  record.phaseDeadlineAt = record.state.roundEndsAt;
  record.state.countdownEndsAt = null;
  record.state.revealedAnswer = null;
  record.state.roundResult = null;
  record.state.guessedCorrectly = [];
  record.state.skipVotes = [];
  record.state.pendingDamage = {};
  record.state.answerOptions = getAnswerOptionsForRoom(roomId);

  events.emitState(record.state);

  record.roundTimer = setTimeout(() => {
    timeoutRound(roomId, events);
  }, ROUND_SECONDS * 1000);
};

const advanceToNextRound = (
  roomId: string,
  players: string[],
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record) return;

  record.state.phase = "COUNTDOWN";
  record.state.currentRound += 1;
  record.state.playlistIndex =
    (record.state.playlistIndex + 1) % record.playlist.length;
  record.state.currentVideoID = null;
  record.state.currentVideoDurationSeconds = null;
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  record.state.countdownEndsAt = null;
  record.state.guessedCorrectly = [];
  record.state.skipVotes = [];
  record.state.pendingDamage = {};
  record.state.revealedAnswer = null;
  record.state.roundResult = null;

  startCountdown(roomId, players, events);
};

const timeoutRound = (roomId: string, events: GameEvents) => {
  const record = games.get(roomId);
  if (!record || record.state.phase !== "PLAYING") return;

  clearTimers(record);

  const currentVideo = getCurrentPlaylistItem(record);
  record.state.phase = "REVEAL";
  record.state.revealedAnswer = currentVideo.canonicalTitle;
  record.state.firstGuessStreaks = createStreaks(
    Object.keys(record.state.health),
  );
  recordRoundResult(record, createRoundResult(currentVideo, {}));
  record.state.roundEndsAt = null;
  record.state.roundStartTime = null;
  record.state.skipVotes = [];
  events.emitSystemMessage(
    `Time is up! The answer was ${currentVideo.canonicalTitle}.`,
  );
  events.emitState(record.state);

  record.phaseDeadlineAt = Date.now() + REVEAL_SECONDS * 1000;
  record.revealTimer = setTimeout(() => {
    const activeRecord = games.get(roomId);
    if (!activeRecord || activeRecord.state.phase !== "REVEAL") return;

    advanceToNextRound(roomId, Object.keys(activeRecord.state.health), events);
  }, REVEAL_SECONDS * 1000);
};

const revealAfterGrace = (
  roomId: string,
  players: string[],
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record) return;

  const currentVideo = getCurrentPlaylistItem(record);
  record.state.phase = "REVEAL";
  record.state.revealedAnswer = currentVideo.canonicalTitle;
  if (!record.state.roundResult) {
    recordRoundResult(
      record,
      createRoundResult(currentVideo, record.state.pendingDamage),
    );
  }
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  record.state.countdownEndsAt = null;
  record.state.skipVotes = [];

  events.emitSystemMessage(`The answer was ${currentVideo.canonicalTitle}.`);
  events.emitState(record.state);

  record.phaseDeadlineAt = Date.now() + REVEAL_SECONDS * 1000;
  record.revealTimer = setTimeout(() => {
    const activeRecord = games.get(roomId);
    if (!activeRecord || activeRecord.state.phase !== "REVEAL") return;

    advanceToNextRound(roomId, players, events);
  }, REVEAL_SECONDS * 1000);
};

const finishGracePeriod = (
  roomId: string,
  players: string[],
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record || record.state.phase !== "GRACE_PERIOD") return;

  clearTimers(record);

  const [playerA, playerB] = players;
  if (!playerA || !playerB) return;

  const currentVideo = getCurrentPlaylistItem(record);
  const damageA = record.state.pendingDamage[playerA] || 0;
  const damageB = record.state.pendingDamage[playerB] || 0;
  const damageDifference = damageA - damageB;
  let damageDealt = 0;
  let damagedPlayer: string | null = null;

  if (damageDifference > 0) {
    damageDealt = damageDifference;
    damagedPlayer = playerB;
    record.state.health[playerB] = Math.max(
      0,
      (record.state.health[playerB] || 0) - damageDifference,
    );
    events.emitSystemMessage(
      `${playerA} dealt ${damageDifference} damage to ${playerB}!`,
    );
  } else if (damageDifference < 0) {
    damageDealt = Math.abs(damageDifference);
    damagedPlayer = playerA;
    record.state.health[playerA] = Math.max(
      0,
      (record.state.health[playerA] || 0) + damageDifference,
    );
    events.emitSystemMessage(
      `${playerB} dealt ${Math.abs(damageDifference)} damage to ${playerA}!`,
    );
  } else {
    events.emitSystemMessage("It was a tie! No damage dealt!");
  }

  const winner = players.find((player) => record.state.health[player] === 0);

  if (winner) {
    record.phaseDeadlineAt = null;
    const survivingPlayer = players.find((player) => player !== winner) || null;
    record.state.phase = "GAME_OVER";
    record.state.winner = survivingPlayer;
    record.state.revealedAnswer = currentVideo.canonicalTitle;
    recordRoundResult(
      record,
      createRoundResult(
        currentVideo,
        record.state.pendingDamage,
        damageDealt,
        damagedPlayer,
        survivingPlayer,
      ),
    );
    record.state.ready = createReady(players);
    record.state.roundStartTime = null;
    record.state.roundEndsAt = null;
    record.state.countdownEndsAt = null;
    record.state.skipVotes = [];
    events.emitSystemMessage(`${survivingPlayer} wins!`);
    events.emitState(record.state);
    return;
  }

  recordRoundResult(
    record,
    createRoundResult(
      currentVideo,
      record.state.pendingDamage,
      damageDealt,
      damagedPlayer,
    ),
  );
  revealAfterGrace(roomId, players, events);
};

export const getGameState = (roomId: string): GameState | undefined => {
  return games.get(roomId)?.state;
};

export const isJoinAllowedForGame = (roomId: string) => {
  const phase = games.get(roomId)?.state.phase;
  return !phase || phase === "LOBBY" || phase === "GAME_OVER";
};

export const ensureGameForRoom = (
  roomId: string,
  players: string[],
): GameState => {
  const existing = games.get(roomId);

  if (!existing) {
    const state = makeInitialState(
      players,
      getAnswerOptionsForRoom(roomId),
      getDifficultyForRoom(roomId),
    );
    games.set(roomId, {
      state,
      playlist: getPlaylistForRoom(roomId),
      countdownTimer: undefined,
      roundTimer: undefined,
      graceTimer: undefined,
      revealTimer: undefined,
      pausedAt: null,
      pausedRemainingMs: null,
      phaseDeadlineAt: null,
    });
    return state;
  }

  if (existing.state.phase === "LOBBY" || existing.state.phase === "GAME_OVER") {
    syncPlayersForLobby(existing.state, players);
  }
  existing.state.answerOptions = getAnswerOptionsForRoom(roomId);

  return existing.state;
};

export const clearGameForRoom = (roomId: string) => {
  const record = games.get(roomId);
  if (record) clearTimers(record);
  games.delete(roomId);
};

export const setPlayerReady = (
  roomId: string,
  username: string,
  players: string[],
  events: GameEvents,
): { ok: true; state: GameState } | { ok: false; error: string } => {
  const record = games.get(roomId) || {
    state: makeInitialState(
      players,
      getAnswerOptionsForRoom(roomId),
      getDifficultyForRoom(roomId),
    ),
    playlist: getPlaylistForRoom(roomId),
    countdownTimer: undefined,
    roundTimer: undefined,
    graceTimer: undefined,
    revealTimer: undefined,
    pausedAt: null,
    pausedRemainingMs: null,
    phaseDeadlineAt: null,
  };
  games.set(roomId, record);

  if (players.length !== 2) {
    return { ok: false, error: "Exactly 2 players are required to ready up." };
  }

  if (record.state.phase !== "LOBBY" && record.state.phase !== "GAME_OVER") {
    return { ok: false, error: "You can only ready up between matches." };
  }

  syncPlayersForLobby(record.state, players);
  record.state.ready[username] = !record.state.ready[username];

  if (players.every((player) => record.state.ready[player])) {
    const playlist = getPlaylistForRoom(roomId);
    if (playlist.length === 0) {
      return { ok: false, error: "This room has no playable songs." };
    }

    clearTimers(record);
    record.playlist = playlist;
    record.state = makeInitialState(
      players,
      getAnswerOptionsForRoom(roomId),
      getDifficultyForRoom(roomId),
    );
    record.state.ready = createReady(players, true);
    startCountdown(roomId, players, events);
  } else {
    events.emitState(record.state);
  }

  return { ok: true, state: record.state };
};

export const voteToSkipRound = (
  roomId: string,
  username: string,
  players: string[],
  events: GameEvents,
): { ok: true; state: GameState } | { ok: false; error: string } => {
  const record = games.get(roomId);

  if (!record || record.state.phase !== "PLAYING") {
    return { ok: false, error: "Skip votes are only available during active play." };
  }

  if (players.length !== 2 || !players.includes(username)) {
    return { ok: false, error: "Both players must be present to skip." };
  }

  const alreadyVoted = record.state.skipVotes.includes(username);
  if (!alreadyVoted) record.state.skipVotes.push(username);

  if (!players.every((player) => record.state.skipVotes.includes(player))) {
    if (!alreadyVoted) {
      events.emitSystemMessage(
        `${username} voted to skip (${record.state.skipVotes.length}/${players.length}).`,
      );
    }
    events.emitState(record.state);
    return { ok: true, state: record.state };
  }

  clearTimers(record);

  const currentVideo = getCurrentPlaylistItem(record);
  record.state.phase = "REVEAL";
  record.state.revealedAnswer = currentVideo.canonicalTitle;
  record.state.firstGuessStreaks = createStreaks(players);
  recordRoundResult(record, createRoundResult(currentVideo, {}));
  record.state.roundEndsAt = null;
  record.state.roundStartTime = null;
  record.state.countdownEndsAt = null;
  record.state.pendingDamage = {};
  record.state.skipVotes = [];

  events.emitSystemMessage(
    `Both players voted to skip. The answer was ${currentVideo.canonicalTitle}.`,
  );
  events.emitState(record.state);

  record.revealTimer = setTimeout(() => {
    const activeRecord = games.get(roomId);
    if (!activeRecord || activeRecord.state.phase !== "REVEAL") return;

    advanceToNextRound(roomId, players, events);
  }, REVEAL_SECONDS * 1000);

  return { ok: true, state: record.state };
};

const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/g, " ");
};

const getAllowedDistance = (normalizedAnswer: string) => {
  if (normalizedAnswer.length >= 10) return 2;
  if (normalizedAnswer.length >= 5) return 1;
  return 0;
};

const getImplicitAnswerAliases = (track: PlaylistTrack): AnswerAlias[] =>
  [
    track.canonicalTitle,
    track.romajiName,
    track.nativeName,
  ]
    .filter((term): term is string => Boolean(term?.trim()))
    .map((value) => ({ value, match: "fuzzy" }));

export const isCorrectAnswer = (
  message: string,
  track: PlaylistTrack,
): boolean => {
  const normalizedGuess = normalizeString(message);
  if (!normalizedGuess) return false;

  const aliases = [...getImplicitAnswerAliases(track), ...track.answerAliases];

  return aliases.some((alias) => {
    const normalizedAlias = normalizeString(alias.value);
    if (!normalizedAlias) return false;

    if (alias.match === "exact") {
      return normalizedGuess === normalizedAlias;
    }

    const distance = getLevenshteinDistance(normalizedGuess, normalizedAlias);
    return distance <= getAllowedDistance(normalizedAlias);
  });
};

const getLevenshteinDistance = (a: string, b: string): number => {
  const tmp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) {
    tmp[i]![0] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    tmp[0]![j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i]![j] = Math.min(
        tmp[i - 1]![j]! + 1, // Deletion
        tmp[i]![j - 1]! + 1, // Insertion
        tmp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1), // Substitution
      );
    }
  }

  return tmp[a.length]![b.length]!;
};

export const calculateGuessDamage = (
  elapsedSeconds: number,
  firstGuessStreak: number,
) => {
  const safeElapsedSeconds = Math.max(0, elapsedSeconds);
  const baseDamage = Math.max(
    100,
    Math.round(1000 * Math.pow(0.96, safeElapsedSeconds)),
  );
  const streakMultiplier = Math.pow(
    1.5,
    Math.max(0, firstGuessStreak - 1),
  );
  return Math.round(baseDamage * streakMultiplier);
};

export const handleGuess = (
  roomId: string,
  username: string,
  players: string[],
  message: string,
  events: GameEvents,
): boolean => {
  const record = games.get(roomId);
  if (
    !record ||
    (record.state.phase !== "PLAYING" &&
      record.state.phase !== "GRACE_PERIOD") ||
    record.state.roundStartTime === null ||
    record.state.guessedCorrectly.includes(username)
  ) {
    return false;
  }

  const currentVideo = getCurrentPlaylistItem(record);
  if (!isCorrectAnswer(message, currentVideo)) {
    return false;
  }

  if (record.roundTimer) clearTimeout(record.roundTimer);
  record.roundTimer = undefined;

  const elapsedSeconds = Math.max(
    0,
    (Date.now() - record.state.roundStartTime) / 1000,
  );
  const isFirstCorrectGuess = record.state.guessedCorrectly.length === 0;

  if (isFirstCorrectGuess) {
    for (const player of players) {
      record.state.firstGuessStreaks[player] =
        player === username
          ? (record.state.firstGuessStreaks[player] ?? 0) + 1
          : 0;
    }
  }

  const streak = isFirstCorrectGuess
    ? record.state.firstGuessStreaks[username] ?? 1
    : 1;
  const damage = calculateGuessDamage(elapsedSeconds, streak);

  record.state.pendingDamage[username] = damage;
  record.state.guessedCorrectly.push(username);
  const startsGracePeriod = record.state.phase === "PLAYING";
  record.state.phase = "GRACE_PERIOD";
  if (startsGracePeriod) {
    record.phaseDeadlineAt = Date.now() + GRACE_SECONDS * 1000;
    record.state.roundEndsAt = record.phaseDeadlineAt;
  }

  events.emitSystemMessage(`${username} guessed correctly.`);
  events.emitState(record.state);

  if (startsGracePeriod) {
    record.graceTimer = setTimeout(() => {
      finishGracePeriod(roomId, players, events);
    }, GRACE_SECONDS * 1000);
  }

  return true;
};

export const pauseGameForReconnect = (
  roomId: string,
  playerName: string,
  expiresAt: number,
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record || record.state.connectionPause) return false;

  const now = Date.now();
  const deadline = record.phaseDeadlineAt;
  record.pausedAt = now;
  record.pausedRemainingMs = deadline === null ? null : Math.max(0, deadline - now);
  record.state.connectionPause = { playerName, expiresAt };
  clearTimers(record);
  events.emitState(record.state);
  events.emitSystemMessage(`${playerName} disconnected. The match is paused for 20 seconds.`);
  return true;
};

export const resumeGameAfterReconnect = (
  roomId: string,
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record || !record.state.connectionPause || record.pausedAt === null) return false;

  const now = Date.now();
  const pausedDuration = now - record.pausedAt;
  const remaining = record.pausedRemainingMs;
  if (record.state.roundStartTime !== null) {
    record.state.roundStartTime += pausedDuration;
  }
  if (record.state.countdownEndsAt !== null) {
    record.state.countdownEndsAt += pausedDuration;
  }
  if (record.state.roundEndsAt !== null) {
    record.state.roundEndsAt += pausedDuration;
  }
  if (record.phaseDeadlineAt !== null) record.phaseDeadlineAt += pausedDuration;

  record.state.connectionPause = null;
  record.pausedAt = null;
  record.pausedRemainingMs = null;
  const players = Object.keys(record.state.health);
  const delay = Math.max(0, remaining ?? REVEAL_SECONDS * 1000);

  if (record.state.phase === "COUNTDOWN") {
    record.countdownTimer = setTimeout(() => startRound(roomId, events), delay);
  } else if (record.state.phase === "PLAYING") {
    record.roundTimer = setTimeout(() => timeoutRound(roomId, events), delay);
  } else if (record.state.phase === "GRACE_PERIOD") {
    record.graceTimer = setTimeout(() => finishGracePeriod(roomId, players, events), delay);
  } else if (record.state.phase === "REVEAL") {
    record.revealTimer = setTimeout(() => advanceToNextRound(roomId, players, events), delay);
  }

  events.emitState(record.state);
  events.emitSystemMessage("Player reconnected. The match is resuming.");
  return true;
};

export const handlePlayerDisconnectForGame = (
  roomId: string,
  username: string,
  updatedPlayers: string[],
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record) return;

  if (updatedPlayers.length === 0) {
    clearGameForRoom(roomId);
    return;
  }

  const activePhases = new Set(["COUNTDOWN", "PLAYING", "GRACE_PERIOD", "REVEAL"]);
  if (activePhases.has(record.state.phase)) {
    clearTimers(record);
    record.state.connectionPause = null;
    record.pausedAt = null;
    record.pausedRemainingMs = null;
    record.phaseDeadlineAt = null;
    const winner = updatedPlayers[0] || null;
    record.state.phase = "GAME_OVER";
    record.state.winner = winner;
    record.state.ready = createReady(updatedPlayers);
    record.state.roundStartTime = null;
    record.state.roundEndsAt = null;
    record.state.countdownEndsAt = null;
    record.state.skipVotes = [];
    events.emitSystemMessage(`${username} left. ${winner} wins!`);
    events.emitState(record.state);
    return;
  }

  if (record.state.phase === "LOBBY" || record.state.phase === "GAME_OVER") {
    syncPlayersForLobby(record.state, updatedPlayers);
    events.emitState(record.state);
  }
};
