import assert from "node:assert/strict";
import test from "node:test";
import { accountHistoryForSnapshots } from "./account-history.js";
import { InMemoryMatchRepository } from "./in-memory-match.repository.js";
import type { TerminalMatchSnapshot } from "./match.repository.js";

const base = (outcome: TerminalMatchSnapshot["terminalOutcome"], matchId: string): TerminalMatchSnapshot => ({
  matchId, idempotencyKey: matchId, mode: "1v1", source: "public", terminalOutcome: outcome, winnerSeatId: outcome === "completed" ? "11111111-1111-4111-8111-111111111111" : null,
  config: { topicIds: ["stacks"], roundCount: 1, questionTimerSeconds: 30 }, questionBankVersion: "test", schemaVersion: 2, questionIds: ["q-test"],
  startedAt: "2026-03-08T00:00:00.000Z", finishedAt: `2026-03-08T00:00:${matchId.slice(-2)}.000Z`,
  players: [
    { seatId: "11111111-1111-4111-8111-111111111111", guestSessionOwner: `${matchId}-one`, authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "One", scoreTotal: outcome === "completed" ? 1000 : 0, correctCount: outcome === "completed" ? 1 : 0, responseMsTotal: 100, isWinner: outcome === "completed" },
    { seatId: "22222222-2222-4222-8222-222222222222", guestSessionOwner: `${matchId}-two`, username: "Two", scoreTotal: 0, correctCount: 0, responseMsTotal: 30_000, isWinner: false },
  ],
  rounds: [{ roundNumber: 1, questionId: "q-test", topicId: "stacks", questionBankVersion: "test", correctness: { "11111111-1111-4111-8111-111111111111": outcome === "completed" ? true : null }, responseMs: { "11111111-1111-4111-8111-111111111111": outcome === "completed" ? 100 : null }, score: { "11111111-1111-4111-8111-111111111111": outcome === "completed" ? 1000 : null } }],
});

test("account progress follows terminal attempt semantics and is duplicate-safe", async () => {
  const repository = new InMemoryMatchRepository();
  const completed = base("completed", "11111111-1111-4111-8111-111111111111");
  const forfeit = base("forfeit", "22222222-2222-4222-8222-222222222222");
  assert.equal((await repository.persistTerminalMatch(completed)).status, "inserted");
  assert.equal((await repository.persistTerminalMatch({ ...completed, terminalOutcome: "draw" })).status, "already_exists");
  await repository.persistTerminalMatch(forfeit);
  const history = await repository.getAccountHistory("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(history.matches.length, 2);
  assert.equal(history.progress.stacks.attempted, 1);
  assert.equal(history.progress.stacks.correct, 1);
  assert.equal(history.progress.stacks.score, 1000);
});

test("unlinked guest terminal snapshots never appear in account history", () => {
  const history = accountHistoryForSnapshots([base("completed", "33333333-3333-4333-8333-333333333333")], "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.deepEqual(history.matches, []);
  assert.equal(history.progress.stacks.attempted, 0);
});
