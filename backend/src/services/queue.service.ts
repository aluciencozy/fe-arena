import type { GameDifficulty, GameMode } from "../types/index.js";

interface QueueEntry {
  socketId: string;
  username: string;
  mode: GameMode;
  difficulty: GameDifficulty;
}

const queues = new Map<string, QueueEntry[]>();

const getQueueKey = (mode: GameMode, difficulty: GameDifficulty) =>
  `${mode}:${difficulty}`;

export const removeFromQueue = (socketId: string) => {
  for (const [key, entries] of queues) {
    const filtered = entries.filter((entry) => entry.socketId !== socketId);
    if (filtered.length === entries.length) continue;

    queues.set(key, filtered);
    return true;
  }

  return false;
};

export const enqueuePlayer = (
  socketId: string,
  username: string,
  mode: GameMode,
  difficulty: GameDifficulty = "standard",
): { status: "waiting" } | { status: "matched"; opponent: QueueEntry } => {
  removeFromQueue(socketId);

  const queueKey = getQueueKey(mode, difficulty);
  const queue = queues.get(queueKey) || [];
  const opponent = queue.shift();
  queues.set(queueKey, queue);

  if (opponent) {
    return { status: "matched", opponent };
  }

  queue.push({ socketId, username, mode, difficulty });
  queues.set(queueKey, queue);
  return { status: "waiting" };
};
