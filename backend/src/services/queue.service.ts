import { PUBLIC_QUEUE_MAX_WAIT_SECONDS, PUBLIC_QUESTION_SECONDS, DEFAULT_ROUND_COUNT, TOPICS, type MatchConfig } from "../../../shared/domain.js";

export type QueueEntry = { socketId: string; username: string; queuedAt: number };
const entries: QueueEntry[] = [];
const queueTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const publicConfig: MatchConfig = { topicIds: TOPICS.map((topic) => topic.id), roundCount: DEFAULT_ROUND_COUNT, questionTimerSeconds: PUBLIC_QUESTION_SECONDS };

export const enqueue = (entry: QueueEntry, onExpire?: () => void) => {
  dequeue(entry.socketId);
  const opponent = entries.shift();
  if (opponent) {
    const timer = queueTimers.get(opponent.socketId);
    if (timer) clearTimeout(timer);
    queueTimers.delete(opponent.socketId);
    return { status: "matched" as const, opponent };
  }
  entries.push(entry);
  const timer = setTimeout(() => { if (dequeue(entry.socketId)) onExpire?.(); }, PUBLIC_QUEUE_MAX_WAIT_SECONDS * 1000);
  queueTimers.set(entry.socketId, timer);
  return { status: "waiting" as const, expiresAt: entry.queuedAt + PUBLIC_QUEUE_MAX_WAIT_SECONDS * 1000 };
};

export const dequeue = (socketId: string) => {
  const index = entries.findIndex((entry) => entry.socketId === socketId);
  if (index < 0) return false;
  entries.splice(index, 1);
  const timer = queueTimers.get(socketId);
  if (timer) clearTimeout(timer);
  queueTimers.delete(socketId);
  return true;
};
export const queuePosition = (socketId: string) => entries.findIndex((entry) => entry.socketId === socketId) + 1;
export const clearQueueForTests = () => { for (const timer of queueTimers.values()) clearTimeout(timer); entries.length = 0; queueTimers.clear(); };
