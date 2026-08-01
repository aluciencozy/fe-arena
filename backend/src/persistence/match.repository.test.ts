import assert from "node:assert/strict";
import test from "node:test";
import {
  createMatchRepository,
  InMemoryMatchRepository,
  SupabaseMatchRepository,
  PERSISTENCE_SCHEMA_VERSION,
  QUESTION_BANK_VERSION,
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
    { seatId: "22222222-2222-4222-8222-222222222222", guestSessionOwner: "owner-one", username: "Host", scoreTotal: 1300, correctCount: 1, responseMsTotal: 500, isWinner: true },
    { seatId: "33333333-3333-4333-8333-333333333333", guestSessionOwner: "owner-two", username: "Guest", scoreTotal: 0, correctCount: 0, responseMsTotal: 30000, isWinner: false },
  ],
  rounds: [{
    roundNumber: 1,
    questionId: "q-stacks-lifo",
    questionBankVersion: QUESTION_BANK_VERSION,
    correctness: { "22222222-2222-4222-8222-222222222222": true, "33333333-3333-4333-8333-333333333333": false },
    responseMs: { "22222222-2222-4222-8222-222222222222": 500, "33333333-3333-4333-8333-333333333333": 30000 },
  }],
  ...overrides,
});

test("selects memory persistence without complete server-only Supabase configuration", () => {
  assert.ok(createMatchRepository({}) instanceof InMemoryMatchRepository);
  assert.ok(createMatchRepository({ SUPABASE_URL: "https://example.supabase.co" }) instanceof InMemoryMatchRepository);
  assert.ok(createMatchRepository({ SUPABASE_SECRET_KEY: "secret" }) instanceof InMemoryMatchRepository);
  assert.ok(createMatchRepository({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret" }) instanceof SupabaseMatchRepository);
});

test("memory persistence is idempotent and rejects key reuse", async () => {
  const repository = new InMemoryMatchRepository();
  const first = snapshot();
  assert.deepEqual(await repository.persistTerminalMatch(first), { status: "inserted", matchId: first.matchId });
  assert.deepEqual(await repository.persistTerminalMatch({ ...first, terminalOutcome: "draw" }), { status: "already_exists", matchId: first.matchId });
  assert.equal(repository.size, 1);
  await assert.rejects(repository.persistTerminalMatch({ ...first, idempotencyKey: "44444444-4444-4444-8444-444444444444" }));
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
    const result = await repository.persistTerminalMatch(snapshot({ matchId: id, idempotencyKey: id, terminalOutcome }));
    assert.equal(result.status, "inserted");
  }
  assert.equal(repository.size, outcomes.length);
});
