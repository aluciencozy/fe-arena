import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "./app.js";
import { InMemoryMatchRepository } from "../persistence/in-memory-match.repository.js";
import type { AuthVerifier } from "../services/auth.service.js";
import type { TerminalMatchSnapshot } from "../persistence/match.repository.js";

const snapshot = (matchId: string, authUserId: string): TerminalMatchSnapshot => ({
  matchId, idempotencyKey: matchId, mode: "1v1", source: "private", terminalOutcome: "completed",
  winnerSeatId: "22222222-2222-4222-8222-222222222222", config: { topicIds: ["stacks"], roundCount: 1, questionTimerSeconds: 30 },
  questionBankVersion: "test", schemaVersion: 2, questionIds: ["q-test"], startedAt: "2026-03-08T00:00:00.000Z", finishedAt: "2026-03-08T00:00:30.000Z",
  players: [
    { seatId: "22222222-2222-4222-8222-222222222222", guestSessionOwner: `${matchId}-one`, authUserId, username: "One", scoreTotal: 1000, correctCount: 1, responseMsTotal: 100, isWinner: true },
    { seatId: "33333333-3333-4333-8333-333333333333", guestSessionOwner: `${matchId}-two`, username: "Two", scoreTotal: 0, correctCount: 0, responseMsTotal: 30_000, isWinner: false },
  ],
  rounds: [{ roundNumber: 1, questionId: "q-test", topicId: "stacks", questionBankVersion: "test", correctness: { "22222222-2222-4222-8222-222222222222": true }, responseMs: { "22222222-2222-4222-8222-222222222222": 100 }, score: { "22222222-2222-4222-8222-222222222222": 1000 } }],
});

const request = async (server: ReturnType<typeof createServer>, path: string, token?: string) => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not start");
  return fetch(`http://127.0.0.1:${address.port}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
};

test("history rejects missing and invalid tokens, then returns only the verified user's records", async () => {
  const repository = new InMemoryMatchRepository();
  await repository.persistTerminalMatch(snapshot("11111111-1111-4111-8111-111111111111", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
  await repository.persistTerminalMatch(snapshot("22222222-2222-4222-8222-222222222222", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
  const verifier: AuthVerifier = { verifyAccessToken: async (token) => token === "valid-one" ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } : null };
  const server = createServer(createApp({ authVerifier: verifier, accountHistoryRepository: repository }));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    assert.equal((await request(server, "/api/account/history")).status, 401);
    assert.equal((await request(server, "/api/account/history", "invalid")).status, 401);
    const response = await request(server, "/api/account/history", "valid-one");
    assert.equal(response.status, 200);
    const body = await response.json() as { matches: Array<{ matchId: string }> };
    assert.deepEqual(body.matches.map((match) => match.matchId), ["11111111-1111-4111-8111-111111111111"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
