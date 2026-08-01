import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, readdir, rm, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  MatchRepository,
  PersistTerminalResult,
  TerminalMatchSnapshot,
} from "./match.repository.js";

export const DEFAULT_MATCH_OUTBOX_DIRECTORY = resolve(process.cwd(), ".fe-arena-match-outbox");

type ActiveWrite = {
  idempotencyKey: string;
  promise: Promise<PersistTerminalResult>;
};

export class DurableMatchRepository implements MatchRepository {
  private readonly activeWrites = new Map<string, ActiveWrite>();
  private readonly startupReplay: Promise<void>;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly delegate: MatchRepository,
    private readonly outboxDirectory = DEFAULT_MATCH_OUTBOX_DIRECTORY,
    private readonly retryDelayMs = 5_000,
  ) {
    this.startupReplay = this.replayOutbox().catch(() => this.scheduleRetry());
  }

  persistTerminalMatch(snapshot: TerminalMatchSnapshot): Promise<PersistTerminalResult> {
    const active = this.activeWrites.get(snapshot.matchId);
    if (active) {
      if (active.idempotencyKey !== snapshot.idempotencyKey) {
        return Promise.reject(new Error("A match ID cannot be reused with a different idempotency key."));
      }
      return active.promise;
    }

    const promise = this.persist(snapshot).finally(() => this.activeWrites.delete(snapshot.matchId));
    this.activeWrites.set(snapshot.matchId, { idempotencyKey: snapshot.idempotencyKey, promise });
    return promise;
  }

  async replayPending(): Promise<void> {
    await this.startupReplay;
    await this.replayOutbox();
  }

  close(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private async persist(snapshot: TerminalMatchSnapshot): Promise<PersistTerminalResult> {
    const stagedSnapshot = await this.stage(snapshot);
    await this.startupReplay;
    try {
      return await this.deliver(stagedSnapshot);
    } catch (error) {
      this.scheduleRetry();
      throw error;
    }
  }

  private async stage(snapshot: TerminalMatchSnapshot): Promise<TerminalMatchSnapshot> {
    await mkdir(this.outboxDirectory, { recursive: true });
    const target = this.snapshotPath(snapshot.matchId);
    try {
      return await this.authoritativeSnapshot(target, snapshot);
    } catch (error) {
      if (!this.isMissingFile(error)) throw error;
    }

    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(snapshot), "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      let created = false;
      try {
        await link(temporary, target);
        created = true;
      } catch (error) {
        if (!this.isExistingFile(error)) throw error;
      }
      await this.syncDirectory();
      return created ? snapshot : await this.authoritativeSnapshot(target, snapshot);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async deliver(snapshot: TerminalMatchSnapshot): Promise<PersistTerminalResult> {
    const result = await this.delegate.persistTerminalMatch(snapshot);
    try {
      await unlink(this.snapshotPath(snapshot.matchId));
    } catch (error) {
      if (!this.isMissingFile(error)) throw error;
    }
    await this.syncDirectory();
    return result;
  }

  private async authoritativeSnapshot(path: string, requested: TerminalMatchSnapshot): Promise<TerminalMatchSnapshot> {
    const existing = this.parseSnapshot(await readFile(path, "utf8"), path);
    if (existing.matchId !== requested.matchId || existing.idempotencyKey !== requested.idempotencyKey) {
      throw new Error("A durable match outbox entry cannot be reused with different immutable keys.");
    }
    return existing;
  }

  private async replayOutbox(): Promise<void> {
    await mkdir(this.outboxDirectory, { recursive: true });
    const entries = await readdir(this.outboxDirectory, { withFileTypes: true });
    let retryNeeded = false;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const path = join(this.outboxDirectory, entry.name);
      try {
        const snapshot = this.parseSnapshot(await readFile(path, "utf8"), path);
        await this.deliver(snapshot);
      } catch {
        retryNeeded = true;
      }
    }
    if (retryNeeded) this.scheduleRetry();
  }

  private parseSnapshot(value: string, path: string): TerminalMatchSnapshot {
    const snapshot = JSON.parse(value) as Partial<TerminalMatchSnapshot>;
    if (typeof snapshot.matchId !== "string" || typeof snapshot.idempotencyKey !== "string") {
      throw new Error("The durable match outbox contains an invalid snapshot.");
    }
    if (this.snapshotPath(snapshot.matchId) !== path) {
      throw new Error("The durable match outbox filename does not match its snapshot.");
    }
    return snapshot as TerminalMatchSnapshot;
  }

  private snapshotPath(matchId: string): string {
    const filename = `${createHash("sha256").update(matchId).digest("hex")}.json`;
    return join(this.outboxDirectory, filename);
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.replayOutbox().catch(() => this.scheduleRetry());
    }, this.retryDelayMs);
    this.retryTimer.unref();
  }

  private async syncDirectory(): Promise<void> {
    const directory = await open(this.outboxDirectory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private isMissingFile(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  private isExistingFile(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "EEXIST";
  }
}
