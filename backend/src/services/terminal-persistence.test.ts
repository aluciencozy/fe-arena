import assert from "node:assert/strict";
import test from "node:test";
import {
  type MatchRepository,
  type TerminalMatchSnapshot,
} from "../persistence/match.repository.js";
import {
  clearMatch,
  clearMatchesForTests,
  ensureMatch,
  getMatchState,
  leaveMatch,
  requestRematch,
  setMatchRepository,
  submitAnswer,
  toggleReady,
  waitForMatchPersistenceForTests,
} from "./match.service.js";
import { questionRepository } from "./question-bank.service.js";
import { attachSeat, clearRoomsForTests, createRoom, joinRoom } from "./room.service.js";
import { ClientEventSchemas, type MatchConfig, type Question, type QuestionAttempt } from "../../../shared/domain.js";

const events = () => ({ emit: (_state: unknown) => undefined, message: (_text: string) => undefined });
const config: MatchConfig = { topicIds: ["stacks"], roundCount: 1, questionTimerSeconds: 30 };

class RecordingRepository implements MatchRepository {
  readonly snapshots: TerminalMatchSnapshot[] = [];
  attempts = 0;
  constructor(private readonly failuresBeforeSuccess = 0) {}

  async persistTerminalMatch(snapshot: TerminalMatchSnapshot) {
    this.attempts += 1;
    if (this.attempts <= this.failuresBeforeSuccess) throw new Error("deterministic database failure");
    this.snapshots.push(structuredClone(snapshot));
    return { status: "inserted" as const, matchId: snapshot.matchId };
  }
}

class DeferredRepository implements MatchRepository {
  readonly snapshots: TerminalMatchSnapshot[] = [];
  private readonly completions: Array<() => void> = [];

  persistTerminalMatch(snapshot: TerminalMatchSnapshot): Promise<{ status: "inserted"; matchId: string }> {
    this.snapshots.push(structuredClone(snapshot));
    return new Promise((resolve) => {
      this.completions.push(() => resolve({ status: "inserted", matchId: snapshot.matchId }));
    });
  }

  completeNext(): void {
    this.completions.shift()?.();
  }
}

const setupRoom = () => {
  const room = createRoom("private", config, "Host");
  attachSeat(room.metadata.roomId, room.seat, "host-socket");
  const guest = joinRoom(room.metadata.roomId, "Guest", "guest-socket");
  assert.equal(guest.ok, true);
  if (!guest.ok) throw new Error("test room did not get a second seat");
  ensureMatch(room.metadata.roomId);
  return { room, guest };
};

const answerFor = (question: Question): string | number | boolean | string[] => {
  if (question.type === "multiple-choice") return question.answer;
  if (question.type === "numeric") return question.answer;
  if (question.type === "short-answer") return question.answers[0]!;
  if (question.type === "code-output") return question.output;
  if (question.type === "ordered-sequence") return question.answerOrder;
  if (question.operation === "reachability") return question.reachable!;
  if (question.operation === "shortest-path") return question.distance!;
  if (question.operation === "adjacency") return question.adjacentNodes!;
  return question.answerOrder!;
};

const startMatch = () => {
  const { room, guest } = setupRoom();
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  return { room, guest };
};

test("persists a completed result and maps an exact tie to draw", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const repository = new RecordingRepository();
  setMatchRepository(repository);
  clearMatchesForTests();
  clearRoomsForTests();
  const { room, guest } = startMatch();
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  const wrong: QuestionAttempt = { questionId, answer: "not-the-answer" };
  assert.equal(submitAnswer(room.metadata.roomId, room.seat.seatId, wrong, events()).ok, true);
  assert.equal(submitAnswer(room.metadata.roomId, guest.seat.seatId, wrong, events()).ok, true);
  t.mock.timers.tick(1_800);
  await waitForMatchPersistenceForTests();
  assert.equal(getMatchState(room.metadata.roomId)?.endReason, "completed");
  assert.equal(repository.snapshots[0]?.terminalOutcome, "draw");
  assert.equal(repository.snapshots.length, 1);
  clearMatch(room.metadata.roomId);
  clearRoomsForTests();
});

test("persists every non-normal terminal outcome once", async () => {
  for (const outcome of ["forfeit", "abandoned", "expired"] as const) {
    const repository = new RecordingRepository();
    setMatchRepository(repository);
    clearMatchesForTests();
    clearRoomsForTests();
    const { room, guest } = setupRoom();
    leaveMatch(room.metadata.roomId, guest.seat.seatId, outcome, events());
    leaveMatch(room.metadata.roomId, guest.seat.seatId, outcome, events());
    await waitForMatchPersistenceForTests();
    assert.equal(repository.snapshots.length, 1);
    assert.equal(repository.snapshots[0]?.terminalOutcome, outcome);
    assert.equal(repository.snapshots[0]?.players.length, 2);
  }
  clearMatchesForTests();
  clearRoomsForTests();
});

test("ignores client-supplied scoring fields and persists only server results", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const repository = new RecordingRepository();
  setMatchRepository(repository);
  clearMatchesForTests();
  clearRoomsForTests();
  const { room, guest } = setupRoom();
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  const question = questionRepository.get(questionId);
  assert.ok(question);
  const forgedAttempt = ClientEventSchemas["match:submit"].parse({
    questionId,
    answer: answerFor(question),
    correct: false,
    score: { correctness: 0, speedBonus: 0, total: 0 },
    responseMs: 300_000,
  });
  assert.deepEqual(Object.keys(forgedAttempt).sort(), ["answer", "questionId"]);
  assert.equal(submitAnswer(room.metadata.roomId, room.seat.seatId, forgedAttempt, events()).ok, true);
  assert.equal(submitAnswer(room.metadata.roomId, guest.seat.seatId, { questionId, answer: "not-the-answer" }, events()).ok, true);
  t.mock.timers.tick(1_800);
  await waitForMatchPersistenceForTests();
  const stored = repository.snapshots[0]!;
  assert.equal(stored.terminalOutcome, "completed");
  assert.equal(stored.players.find((player) => player.isWinner)?.username, "Host");
  assert.equal("answer" in stored, false);
  assert.equal(JSON.stringify(stored).includes("answer"), false);
  assert.notEqual(stored.players[0]?.guestSessionOwner, room.seat.reconnectToken);
  clearMatch(room.metadata.roomId);
  clearRoomsForTests();
});

test("database failure does not change the live terminal result", async () => {
  const repository = new RecordingRepository(1);
  setMatchRepository(repository);
  clearMatchesForTests();
  clearRoomsForTests();
  const { room, guest } = setupRoom();
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "forfeit", events());
  await waitForMatchPersistenceForTests();
  assert.equal(repository.attempts, 1);
  assert.equal(repository.snapshots.length, 0);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "FORFEIT");
  assert.equal(getMatchState(room.metadata.roomId)?.winnerSeatId, room.seat.seatId);
  clearMatchesForTests();
  clearRoomsForTests();
});

test("an old terminal write cannot suppress persistence for a rematch", async () => {
  const repository = new DeferredRepository();
  setMatchRepository(repository);
  clearMatchesForTests();
  clearRoomsForTests();
  const { room, guest } = setupRoom();
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "forfeit", events());
  assert.equal(requestRematch(room.metadata.roomId, room.seat.seatId, events()).ok, true);
  const firstMatchId = repository.snapshots[0]?.matchId;
  repository.completeNext();
  await waitForMatchPersistenceForTests();
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "forfeit", events());
  assert.equal(repository.snapshots.length, 2);
  assert.notEqual(repository.snapshots[1]?.matchId, firstMatchId);
  repository.completeNext();
  await waitForMatchPersistenceForTests();
  clearMatchesForTests();
  clearRoomsForTests();
});
