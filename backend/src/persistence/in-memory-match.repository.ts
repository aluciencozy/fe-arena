import { accountHistoryForSnapshots } from "./account-history.js";
import type {
  AccountHistoryRepository,
  MatchRepository,
  PersistTerminalResult,
  TerminalMatchSnapshot,
} from "./match.repository.js";

/** Test/local adapter. It has the same immutable-key behavior as the SQL adapter. */
export class InMemoryMatchRepository implements MatchRepository, AccountHistoryRepository {
  private readonly records = new Map<string, TerminalMatchSnapshot>();
  private readonly idempotencyKeys = new Map<string, string>();

  async persistTerminalMatch(snapshot: TerminalMatchSnapshot): Promise<PersistTerminalResult> {
    const existing = this.records.get(snapshot.matchId);
    if (existing) {
      if (existing.idempotencyKey !== snapshot.idempotencyKey) {
        throw new Error("A match ID cannot be reused with a different idempotency key.");
      }
      return { status: "already_exists", matchId: snapshot.matchId };
    }

    const existingMatchId = this.idempotencyKeys.get(snapshot.idempotencyKey);
    if (existingMatchId && existingMatchId !== snapshot.matchId) {
      throw new Error("An idempotency key cannot be reused for another match.");
    }

    this.records.set(snapshot.matchId, structuredClone(snapshot));
    this.idempotencyKeys.set(snapshot.idempotencyKey, snapshot.matchId);
    return { status: "inserted", matchId: snapshot.matchId };
  }

  async getAccountHistory(authUserId: string) {
    return accountHistoryForSnapshots([...this.records.values()], authUserId);
  }

  getForOwner(matchId: string, guestSessionOwner: string): TerminalMatchSnapshot | undefined {
    const snapshot = this.records.get(matchId);
    if (!snapshot || !snapshot.players.some((player) => player.guestSessionOwner === guestSessionOwner)) return undefined;
    return structuredClone(snapshot);
  }

  get(matchId: string): TerminalMatchSnapshot | undefined {
    const snapshot = this.records.get(matchId);
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  get size() {
    return this.records.size;
  }

  clear() {
    this.records.clear();
    this.idempotencyKeys.clear();
  }
}
