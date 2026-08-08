import { randomUUID } from "node:crypto";
import {
  PUBLIC_QUEUE_MAX_WAIT_SECONDS,
  PUBLIC_QUESTION_SECONDS,
  DEFAULT_ROUND_COUNT,
  TOPICS,
  type MatchConfig,
} from "../../../shared/domain.js";

export type QueueEntry = {
  socketId: string;
  username: string;
  queuedAt: number;
  supportsCoding: boolean;
  queueToken?: string;
};
type StoredQueueEntry = QueueEntry & { queueToken: string; connected: boolean };
const entries: StoredQueueEntry[] = [];
const queueTimers = new Map<string, ReturnType<typeof setTimeout>>();
const expiryHandlers = new Map<string, () => void>();
export const QUEUE_NAME_TAKEN_MESSAGE =
  "That guest name is already waiting in the public queue. Choose a different name.";
export const publicConfig: MatchConfig = {
  topicIds: TOPICS.map((topic) => topic.id),
  roundCount: DEFAULT_ROUND_COUNT,
  questionTimerSeconds: PUBLIC_QUESTION_SECONDS,
  includeCoding: true,
};

const clearTimer = (queueToken: string) => {
  const timer = queueTimers.get(queueToken);
  if (timer) clearTimeout(timer);
  queueTimers.delete(queueToken);
  expiryHandlers.delete(queueToken);
};

const expire = (queueToken: string) => {
  const index = entries.findIndex((entry) => entry.queueToken === queueToken);
  if (index < 0) return false;
  const [entry] = entries.splice(index, 1);
  const onExpire = expiryHandlers.get(queueToken);
  clearTimer(queueToken);
  if (entry?.connected) onExpire?.();
  return true;
};

const scheduleExpiry = (entry: StoredQueueEntry, onExpire?: () => void) => {
  if (onExpire) expiryHandlers.set(entry.queueToken, onExpire);
  const delay = Math.max(0, entry.queuedAt + PUBLIC_QUEUE_MAX_WAIT_SECONDS * 1000 - Date.now());
  queueTimers.set(
    entry.queueToken,
    setTimeout(() => expire(entry.queueToken), delay),
  );
};

export const enqueue = (entry: QueueEntry, onExpire?: () => void) => {
  const existing = entry.queueToken
    ? entries.find((candidate) => candidate.queueToken === entry.queueToken)
    : undefined;
  if (entry.queueToken && !existing) return { status: "expired" as const };
  if (existing) {
    if (existing.socketId !== entry.socketId) dequeue(entry.socketId);
    existing.socketId = entry.socketId;
    existing.supportsCoding = entry.supportsCoding;
    existing.connected = true;
    if (onExpire) expiryHandlers.set(existing.queueToken, onExpire);
    return {
      status: "waiting" as const,
      expiresAt: existing.queuedAt + PUBLIC_QUEUE_MAX_WAIT_SECONDS * 1000,
      queueToken: existing.queueToken,
    };
  }

  const existingForSocket = entries.find((candidate) => candidate.socketId === entry.socketId);
  if (existingForSocket) {
    existingForSocket.connected = true;
    existingForSocket.supportsCoding = entry.supportsCoding;
    if (onExpire) expiryHandlers.set(existingForSocket.queueToken, onExpire);
    return {
      status: "waiting" as const,
      expiresAt: existingForSocket.queuedAt + PUBLIC_QUEUE_MAX_WAIT_SECONDS * 1000,
      queueToken: existingForSocket.queueToken,
    };
  }

  const username = entry.username.trim();
  const normalizedUsername = username.toLocaleLowerCase("en-US");
  if (entries.some((candidate) => candidate.username.trim().toLocaleLowerCase("en-US") === normalizedUsername))
    return { status: "name-taken" as const };

  dequeue(entry.socketId);
  const normalized: StoredQueueEntry = {
    ...entry,
    username,
    queueToken: entry.queueToken ?? randomUUID(),
    connected: true,
  };
  const opponentIndex = entries.findIndex(
    (candidate) => candidate.connected && candidate.supportsCoding === normalized.supportsCoding,
  );
  if (opponentIndex >= 0) {
    const [opponent] = entries.splice(opponentIndex, 1);
    if (!opponent) throw new Error("Queue opponent disappeared.");
    clearTimer(opponent.queueToken);
    return { status: "matched" as const, opponent, entry: normalized };
  }

  entries.push(normalized);
  scheduleExpiry(normalized, onExpire);
  return {
    status: "waiting" as const,
    expiresAt: normalized.queuedAt + PUBLIC_QUEUE_MAX_WAIT_SECONDS * 1000,
    queueToken: normalized.queueToken,
  };
};

export const dequeue = (socketId: string) => {
  const index = entries.findIndex((entry) => entry.socketId === socketId);
  if (index < 0) return false;
  const [entry] = entries.splice(index, 1);
  if (entry) clearTimer(entry.queueToken);
  return true;
};
export const suspend = (socketId: string) => {
  const entry = entries.find((candidate) => candidate.socketId === socketId);
  if (!entry) return false;
  entry.connected = false;
  return true;
};
export const queuePosition = (socketId: string) => entries.findIndex((entry) => entry.socketId === socketId) + 1;
export const clearQueueForTests = () => {
  for (const timer of queueTimers.values()) clearTimeout(timer);
  entries.length = 0;
  queueTimers.clear();
  expiryHandlers.clear();
};
