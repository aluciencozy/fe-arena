import type { GameState } from "../types/index.js";

const INTRO_SECONDS = 5.8;
const COUNTDOWN_SECONDS = 5;
const ROUND_SECONDS = 60;
const GRACE_SECONDS = 3;
const REVEAL_SECONDS = 3;
const STARTING_HEALTH = 5000;

const PLAYLIST = [
  { videoId: "B5UUcVGqBDE", answer: "attack on titan" },
  { videoId: "j6eA1_K7fO0", answer: "naruto" },
];

type TimerHandle = ReturnType<typeof setTimeout>;

interface GameRecord {
  state: GameState;
  playlist: typeof PLAYLIST;
  introTimer: TimerHandle | undefined;
  countdownTimer: TimerHandle | undefined;
  roundTimer: TimerHandle | undefined;
  graceTimer: TimerHandle | undefined;
  revealTimer: TimerHandle | undefined;
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

const shufflePlaylist = () => {
  const shuffled = [...PLAYLIST];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }

  return shuffled;
};

const getCurrentPlaylistItem = (record: GameRecord) =>
  record.playlist[record.state.playlistIndex % record.playlist.length]!;

const clearTimers = (record: GameRecord) => {
  if (record.introTimer) clearTimeout(record.introTimer);
  if (record.countdownTimer) clearTimeout(record.countdownTimer);
  if (record.roundTimer) clearTimeout(record.roundTimer);
  if (record.graceTimer) clearTimeout(record.graceTimer);
  if (record.revealTimer) clearTimeout(record.revealTimer);
  record.introTimer = undefined;
  record.countdownTimer = undefined;
  record.roundTimer = undefined;
  record.graceTimer = undefined;
  record.revealTimer = undefined;
};

const makeInitialState = (players: string[]): GameState => ({
  phase: "LOBBY",
  currentRound: 0,
  health: createHealth(players),
  pendingDamage: {},
  currentVideoID: null,
  videoStartTime: 0,
  roundStartTime: null,
  countdownEndsAt: null,
  roundEndsAt: null,
  guessedCorrectly: [],
  ready: createReady(players),
  winner: null,
  revealedAnswer: null,
  playlistIndex: 0,
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

const startIntroAnimation = (
  roomId: string,
  players: string[],
  events: GameEvents,
) => {
  const record = games.get(roomId);
  if (!record) return;

  clearTimers(record);

  record.state.phase = "INTRO_ANIMATION";
  record.state.currentRound = 0;
  record.state.playlistIndex = 0;
  record.state.currentVideoID = null;
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  record.state.countdownEndsAt = null;
  record.state.revealedAnswer = null;
  record.state.guessedCorrectly = [];
  record.state.pendingDamage = {};
  record.state.ready = createReady(players, true);

  events.emitState(record.state);

  record.introTimer = setTimeout(() => {
    startCountdown(roomId, players, events);
  }, INTRO_SECONDS * 1000);
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
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  record.state.currentVideoID = getCurrentPlaylistItem(record).videoId;
  record.state.revealedAnswer = null;
  record.state.guessedCorrectly = [];
  record.state.pendingDamage = {};
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
  record.state.videoStartTime = 0;
  record.state.roundStartTime = now;
  record.state.roundEndsAt = now + ROUND_SECONDS * 1000;
  record.state.countdownEndsAt = null;
  record.state.revealedAnswer = null;
  record.state.guessedCorrectly = [];
  record.state.pendingDamage = {};

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
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  record.state.countdownEndsAt = null;
  record.state.guessedCorrectly = [];
  record.state.pendingDamage = {};
  record.state.revealedAnswer = null;

  startCountdown(roomId, players, events);
};

const timeoutRound = (roomId: string, events: GameEvents) => {
  const record = games.get(roomId);
  if (!record || record.state.phase !== "PLAYING") return;

  clearTimers(record);

  const currentVideo = getCurrentPlaylistItem(record);
  record.state.phase = "REVEAL";
  record.state.revealedAnswer = currentVideo.answer;
  record.state.roundEndsAt = null;
  record.state.roundStartTime = null;
  events.emitSystemMessage(`Time is up! The answer was ${currentVideo.answer}.`);
  events.emitState(record.state);

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
  record.state.revealedAnswer = currentVideo.answer;
  record.state.roundStartTime = null;
  record.state.roundEndsAt = null;
  record.state.countdownEndsAt = null;

  events.emitSystemMessage(`The answer was ${currentVideo.answer}.`);
  events.emitState(record.state);

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

  const damageA = record.state.pendingDamage[playerA] || 0;
  const damageB = record.state.pendingDamage[playerB] || 0;
  const damageDifference = damageA - damageB;

  if (damageDifference > 0) {
    record.state.health[playerB] = Math.max(
      0,
      (record.state.health[playerB] || 0) - damageDifference,
    );
    events.emitSystemMessage(
      `${playerA} dealt ${damageDifference} damage to ${playerB}!`,
    );
  } else if (damageDifference < 0) {
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
    const survivingPlayer = players.find((player) => player !== winner) || null;
    record.state.phase = "GAME_OVER";
    record.state.winner = survivingPlayer;
    record.state.ready = createReady(players);
    record.state.roundStartTime = null;
    record.state.roundEndsAt = null;
    record.state.countdownEndsAt = null;
    events.emitSystemMessage(`${survivingPlayer} wins!`);
    events.emitState(record.state);
    return;
  }

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
    const state = makeInitialState(players);
    games.set(roomId, {
      state,
      playlist: shufflePlaylist(),
      introTimer: undefined,
      countdownTimer: undefined,
      roundTimer: undefined,
      graceTimer: undefined,
      revealTimer: undefined,
    });
    return state;
  }

  if (existing.state.phase === "LOBBY" || existing.state.phase === "GAME_OVER") {
    syncPlayersForLobby(existing.state, players);
  }

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
    state: makeInitialState(players),
    playlist: shufflePlaylist(),
    introTimer: undefined,
    countdownTimer: undefined,
    roundTimer: undefined,
    graceTimer: undefined,
    revealTimer: undefined,
  };
  games.set(roomId, record);

  if (players.length !== 2) {
    return { ok: false, error: "Exactly 2 players are required to ready up." };
  }

  if (record.state.phase !== "LOBBY" && record.state.phase !== "GAME_OVER") {
    return { ok: false, error: "You can only ready up between matches." };
  }

  syncPlayersForLobby(record.state, players);
  record.state.ready[username] = true;

  if (players.every((player) => record.state.ready[player])) {
    clearTimers(record);
    record.playlist = shufflePlaylist();
    record.state = makeInitialState(players);
    record.state.ready = createReady(players, true);
    startIntroAnimation(roomId, players, events);
  } else {
    events.emitState(record.state);
  }

  return { ok: true, state: record.state };
};

const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ");   // Collapse multiple spaces to a single space
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
  const normalizedGuess = normalizeString(message);
  const normalizedAnswer = normalizeString(currentVideo.answer);

  const distance = getLevenshteinDistance(normalizedGuess, normalizedAnswer);
  
  // Dynamic threshold based on length:
  // length <= 4: 0 typos allowed
  // 5 <= length <= 9: 1 typo allowed
  // length >= 10: 2 typos allowed
  let allowedDistance = 0;
  if (normalizedAnswer.length >= 5 && normalizedAnswer.length <= 9) {
    allowedDistance = 1;
  } else if (normalizedAnswer.length >= 10) {
    allowedDistance = 2;
  }

  if (distance > allowedDistance) {
    return false;
  }

  if (record.roundTimer) clearTimeout(record.roundTimer);
  record.roundTimer = undefined;

  const elapsedSeconds = Math.floor(
    (Date.now() - record.state.roundStartTime) / 1000,
  );
  const baseDamage = Math.max(100, Math.min(1000, 1000 - elapsedSeconds));

  // Exponential scaling based on currentRound (1.2 ^ currentRound)
  const roundMultiplier = Math.pow(1.2, record.state.currentRound);
  const damage = Math.round(baseDamage * roundMultiplier);

  record.state.pendingDamage[username] = damage;
  record.state.guessedCorrectly.push(username);
  const startsGracePeriod = record.state.phase === "PLAYING";
  record.state.phase = "GRACE_PERIOD";
  record.state.roundEndsAt = null;

  events.emitSystemMessage(`${username} guessed correctly.`);
  events.emitState(record.state);

  if (startsGracePeriod) {
    record.graceTimer = setTimeout(() => {
      finishGracePeriod(roomId, players, events);
    }, GRACE_SECONDS * 1000);
  }

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

  const activePhases = new Set(["INTRO_ANIMATION", "COUNTDOWN", "PLAYING", "GRACE_PERIOD", "REVEAL"]);
  if (activePhases.has(record.state.phase)) {
    clearTimers(record);
    const winner = updatedPlayers[0] || null;
    record.state.phase = "GAME_OVER";
    record.state.winner = winner;
    record.state.ready = createReady(updatedPlayers);
    record.state.roundStartTime = null;
    record.state.roundEndsAt = null;
    record.state.countdownEndsAt = null;
    events.emitSystemMessage(`${username} left. ${winner} wins!`);
    events.emitState(record.state);
    return;
  }

  if (record.state.phase === "LOBBY" || record.state.phase === "GAME_OVER") {
    syncPlayersForLobby(record.state, updatedPlayers);
    events.emitState(record.state);
  }
};
