import type { GameMode } from "../types/index.js";

interface QueueEntry {
  socketId: string;
  username: string;
  mode: GameMode;
}

const queues = new Map<GameMode, QueueEntry[]>();

export const removeFromQueue = (socketId: string) => {
  for (const [mode, entries] of queues) {
    const filtered = entries.filter((entry) => entry.socketId !== socketId);
    if (filtered.length === entries.length) continue;

    queues.set(mode, filtered);
    return true;
  }

  return false;
};

export const enqueuePlayer = (
  socketId: string,
  username: string,
  mode: GameMode,
): { status: "waiting" } | { status: "matched"; opponent: QueueEntry } => {
  removeFromQueue(socketId);

  const queue = queues.get(mode) || [];
  const opponent = queue.shift();
  queues.set(mode, queue);

  if (opponent) {
    return { status: "matched", opponent };
  }

  queue.push({ socketId, username, mode });
  queues.set(mode, queue);
  return { status: "waiting" };
};
