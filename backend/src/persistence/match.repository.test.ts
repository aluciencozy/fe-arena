import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createMatchRepository,
  DurableMatchRepository,
  InMemoryMatchRepository,
  PERSISTENCE_SCHEMA_VERSION,
  QUESTION_BANK_VERSION,
  type MatchRepository,
  type TerminalMatchSnapshot,
} from "./index.js";

const snapshot = (overrides: Partial<TerminalMatchSnapshot> = {}): TerminalMatchSnapshot => ({
  matchId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  mode: "1v1",
  source: "private",
  terminalOutcome: "completed",
  winnerSeatId: "22222222-2222-4222-8222-222222222222",
  config: { topicIds: ["stacks"], roundCount: 1, questionTimerSeconds: 30 },
  questionBankVersion: QUESTION_BANK_VERSION,
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  questionIds: ["q-stacks-lifo"],
  startedAt: "2026-03-08T00:00:00.000Z",
  finishedAt: "2026-03-08T00:00:30.000Z",
  players: [
    {
      seatId: "22222222-2222-4222-8222-222222222222",
      guestSessionOwner: "owner-one",
      username: "Host",
      scoreTotal: 1300,
      correctCount: 1,
      responseMsTotal: 500,
      isWinner: true,
    },
    {
      seatId: "33333333-3333-4333-8333-333333333333",
      guestSessionOwner: "owner-two",
      username: "Guest",
      scoreTotal: 0,
      correctCount: 0,
      responseMsTotal: 30000,
      isWinner: false,
    },
  ],
  rounds: [
    {
      roundNumber: 1,
      questionId: "q-stacks-lifo",
      questionBankVersion: QUESTION_BANK_VERSION,
      correctness: { "22222222-2222-4222-8222-222222222222": true, "33333333-3333-4333-8333-333333333333": false },
      responseMs: { "22222222-2222-4222-8222-222222222222": 500, "33333333-3333-4333-8333-333333333333": 30000 },
    },
  ],
  ...overrides,
});

const waitFor = async (predicate: () => Promise<boolean>): Promise<void> => {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for the outbox state.");
};

test("selects memory persistence without complete server-only Supabase configuration", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".terminal-outbox-test-"));
  assert.ok(createMatchRepository({}) instanceof InMemoryMatchRepository);
  assert.ok(createMatchRepository({ SUPABASE_URL: "https://example.supabase.co" }) instanceof InMemoryMatchRepository);
  assert.ok(createMatchRepository({ SUPABASE_SECRET_KEY: "secret" }) instanceof InMemoryMatchRepository);
  const repository = createMatchRepository(
    { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret" },
    directory,
  );
  assert.ok(repository instanceof DurableMatchRepository);
  if (repository instanceof DurableMatchRepository) {
    await repository.replayPending();
    repository.close();
  }
  await rm(directory, { recursive: true, force: true });
});

test("durable persistence replays a failed terminal write after process restart", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".terminal-outbox-test-"));
  const first = snapshot();
  const failing: MatchRepository = {
    persistTerminalMatch: async () => {
      throw new Error("database unavailable");
    },
  };
  const delivered: TerminalMatchSnapshot[] = [];
  const succeeding: MatchRepository = {
    persistTerminalMatch: async (value) => {
      delivered.push(structuredClone(value));
      return { status: "inserted", matchId: value.matchId };
    },
  };

  try {
    const beforeRestart = new DurableMatchRepository(failing, directory, 60_000);
    await assert.rejects(beforeRestart.persistTerminalMatch(first));
    assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 1);
    beforeRestart.close();

    const afterRestart = new DurableMatchRepository(succeeding, directory, 60_000);
    await afterRestart.replayPending();
    assert.deepEqual(delivered, [first]);
    assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 0);
    afterRestart.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stages a current terminal snapshot while startup replay is blocked", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".terminal-outbox-test-"));
  const backlog = snapshot();
  const current = snapshot({
    matchId: "55555555-5555-4555-8555-555555555555",
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
  });
  const unavailable: MatchRepository = {
    persistTerminalMatch: async () => {
      throw new Error("database unavailable");
    },
  };
  let releaseBacklog: (() => void) | undefined;
  let signalBacklogStarted: (() => void) | undefined;
  const backlogStarted = new Promise<void>((resolve) => {
    signalBacklogStarted = resolve;
  });
  const blocked: MatchRepository = {
    persistTerminalMatch: async (value) => {
      if (value.matchId === backlog.matchId) {
        signalBacklogStarted?.();
        await new Promise<void>((resolve) => {
          releaseBacklog = resolve;
        });
      }
      return { status: "inserted", matchId: value.matchId };
    },
  };
  let afterRestart: DurableMatchRepository | undefined;

  try {
    const beforeRestart = new DurableMatchRepository(unavailable, directory, 60_000);
    await assert.rejects(beforeRestart.persistTerminalMatch(backlog));
    beforeRestart.close();

    afterRestart = new DurableMatchRepository(blocked, directory, 60_000);
    await backlogStarted;
    const currentWrite = afterRestart.persistTerminalMatch(current);
    await waitFor(async () => (await readdir(directory)).filter((name) => name.endsWith(".json")).length === 2);
    releaseBacklog?.();
    await currentWrite;
  } finally {
    releaseBacklog?.();
    afterRestart?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("delivers the staged snapshot when a retry payload changes", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".terminal-outbox-test-"));
  const first = snapshot();
  const delivered: TerminalMatchSnapshot[] = [];
  let unavailable = true;
  const delegate: MatchRepository = {
    persistTerminalMatch: async (value) => {
      if (unavailable) throw new Error("database unavailable");
      delivered.push(structuredClone(value));
      return { status: "inserted", matchId: value.matchId };
    },
  };

  try {
    const repository = new DurableMatchRepository(delegate, directory, 60_000);
    await assert.rejects(repository.persistTerminalMatch(first));
    unavailable = false;
    await repository.persistTerminalMatch({
      ...first,
      terminalOutcome: "draw",
      finishedAt: "2026-03-08T00:01:00.000Z",
    });
    assert.deepEqual(delivered, [first]);
    repository.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("marks live outbox failures degraded and retries a delivery", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".terminal-outbox-test-"));
  const first = snapshot();
  const delivered: TerminalMatchSnapshot[] = [];
  let unavailable = true;
  const delegate: MatchRepository = {
    persistTerminalMatch: async (value) => {
      if (unavailable) throw new Error("database unavailable");
      delivered.push(structuredClone(value));
      return { status: "inserted", matchId: value.matchId };
    },
  };

  try {
    const repository = new DurableMatchRepository(delegate, directory, 60_000);
    await repository.replayPending();
    await assert.rejects(repository.persistTerminalMatch(first));
    assert.deepEqual(repository.readiness(), { status: "degraded" });
    assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 1);
    unavailable = false;
    await repository.replayPending();
    assert.deepEqual(delivered, [first]);
    assert.deepEqual(repository.readiness(), { status: "ready" });
    repository.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retries a terminal snapshot after live staging fails", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".terminal-outbox-test-"));
  const blockedPath = join(directory, "blocked-outbox");
  await writeFile(blockedPath, "not a directory", "utf8");
  const first = snapshot();
  const delivered: TerminalMatchSnapshot[] = [];
  const delegate: MatchRepository = {
    persistTerminalMatch: async (value) => {
      delivered.push(structuredClone(value));
      return { status: "inserted", matchId: value.matchId };
    },
  };

  try {
    const repository = new DurableMatchRepository(delegate, blockedPath, 60_000);
    await assert.rejects(repository.persistTerminalMatch(first));
    assert.deepEqual(repository.readiness(), { status: "degraded" });
    await rm(blockedPath, { force: true });
    await repository.replayPending();
    assert.deepEqual(delivered, [first]);
    assert.deepEqual(repository.readiness(), { status: "ready" });
    repository.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("memory persistence is idempotent and rejects key reuse", async () => {
  const repository = new InMemoryMatchRepository();
  const first = snapshot();
  assert.deepEqual(await repository.persistTerminalMatch(first), { status: "inserted", matchId: first.matchId });
  assert.deepEqual(await repository.persistTerminalMatch({ ...first, terminalOutcome: "draw" }), {
    status: "already_exists",
    matchId: first.matchId,
  });
  assert.equal(repository.size, 1);
  await assert.rejects(
    repository.persistTerminalMatch({ ...first, idempotencyKey: "44444444-4444-4444-8444-444444444444" }),
  );
  await assert.rejects(repository.persistTerminalMatch({ ...first, matchId: "55555555-5555-4555-8555-555555555555" }));
});

test("owner-scoped memory reads return only a participating guest", async () => {
  const repository = new InMemoryMatchRepository();
  const first = snapshot();
  await repository.persistTerminalMatch(first);
  assert.equal(repository.getForOwner(first.matchId, "owner-one")?.matchId, first.matchId);
  assert.equal(repository.getForOwner(first.matchId, "not-a-player"), undefined);
});

test("terminal snapshots carry versions and no answer material", async () => {
  const repository = new InMemoryMatchRepository();
  const first = snapshot();
  await repository.persistTerminalMatch(first);
  const stored = repository.get(first.matchId)!;
  assert.equal(stored.schemaVersion, PERSISTENCE_SCHEMA_VERSION);
  assert.equal(stored.questionBankVersion, QUESTION_BANK_VERSION);
  assert.equal("answer" in stored, false);
  assert.equal(JSON.stringify(stored).includes("answer"), false);
});

test("all terminal outcomes are valid repository records", async () => {
  const outcomes = ["completed", "draw", "forfeit", "abandoned", "expired"] as const;
  const repository = new InMemoryMatchRepository();
  for (const [index, terminalOutcome] of outcomes.entries()) {
    const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`;
    const result = await repository.persistTerminalMatch(
      snapshot({ matchId: id, idempotencyKey: id, terminalOutcome }),
    );
    assert.equal(result.status, "inserted");
  }
  assert.equal(repository.size, outcomes.length);
});
