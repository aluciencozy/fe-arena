import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  LogOut,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  Trophy,
  Users,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useArenaSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/store/gameStore";
import { graphEdgePoints } from "@/lib/graph";
import { prewarmCWorker, runCInWorker, type CExecutionOutcome, type CTestResult } from "@/lib/c-runner";
import { canConfigureMatch, TOPICS, type PublicQuestion, type TopicId } from "../../../shared/domain";
import type { MatchPublicState } from "@/types";

const MAX_CODING_READY_ATTEMPTS = 2;

const codeOf = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
export default function Room() {
  const { id } = useParams();
  const roomId = codeOf(id ?? "");
  const navigate = useNavigate();
  const name = useGameStore((state) => state.playerName);
  const room = useGameStore((state) => state.room);
  const match = useGameStore((state) => state.match);
  const seatId = useGameStore((state) => state.seatId);
  const clearSession = useGameStore((state) => state.clearSession);
  const api = useArenaSocket(roomId, name);
  const markCodingReady = api.codingReady;
  const questionId = match?.question?.id ?? null;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [answerState, setAnswerState] = useState<{
    questionId: string | null;
    value: string | number | boolean | string[];
  }>({ questionId: null, value: "" });
  const [orderedState, setOrderedState] = useState<{ questionId: string | null; value: string[] }>({
    questionId: null,
    value: [],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<TopicId[]>([
    "arrays-memory",
    "linked-lists",
    "stacks",
    "queues",
    "binary-trees",
    "sorting",
    "recursion",
    "analysis-mathematics",
  ]);
  const [timer, setTimer] = useState(90);
  const [includeCoding, setIncludeCoding] = useState(false);
  const [codingReadyError, setCodingReadyError] = useState("");
  const [codingReadyRetry, setCodingReadyRetry] = useState(0);
  const codingReadyAttempted = useRef(false);
  const codingReadyAttempts = useRef(0);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const codingEnvironmentError = window.crossOriginIsolated
    ? ""
    : "Coding rounds require a cross-origin isolated Chromium tab.";
  const codingReadyNotice = codingEnvironmentError || codingReadyError;
  const answer = answerState.questionId === questionId ? answerState.value : "";
  const ordered = orderedState.questionId === questionId ? orderedState.value : [];
  const setAnswer = (value: string | number | boolean | string[]) => setAnswerState({ questionId, value });
  const setOrdered = (value: string[]) => setOrderedState({ questionId, value });
  const retryCodingReady = () => {
    if (codingReadyAttempts.current >= MAX_CODING_READY_ATTEMPTS) return;
    codingReadyAttempted.current = false;
    setCodingReadyError("");
    setCodingReadyRetry((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (!name || !roomId) navigate("/", { replace: true });
  }, [name, navigate, roomId]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!match?.config.includeCoding) {
      codingReadyAttempted.current = false;
      codingReadyAttempts.current = 0;
      return;
    }
    if (match.phase === "REMATCH") {
      codingReadyAttempted.current = false;
      codingReadyAttempts.current = 0;
      return;
    }
    if (
      !seatId ||
      match.codingReady[seatId] ||
      codingReadyAttempted.current ||
      codingReadyAttempts.current >= MAX_CODING_READY_ATTEMPTS ||
      !["LOBBY", "SETUP", "READY"].includes(match.phase)
    )
      return;
    codingReadyAttempted.current = true;
    codingReadyAttempts.current += 1;
    if (!window.crossOriginIsolated) return;
    // Match updates must not cancel this browser-local initialization. The server
    // accepts readiness only after the worker has initialized successfully.
    void prewarmCWorker()
      .then(() => {
        setCodingReadyError("");
        markCodingReady();
      })
      .catch((error) => {
        codingReadyAttempted.current = false;
        setCodingReadyError(error instanceof Error ? error.message : "The browser C compiler could not initialize.");
      });
  }, [codingReadyRetry, markCodingReady, match?.codingReady, match?.config.includeCoding, match?.phase, seatId]);
  const seats = room?.seats ?? [];
  const self = seats.find((seat) => seat.seatId === seatId);
  const opponent = seats.find((seat) => seat.seatId !== seatId);
  const host = room ? canConfigureMatch(room.metadata.source, room.metadata.hostSeatId, seatId) : false;
  const isSubmitted = seatId ? Boolean(match?.submissions[seatId]?.submitted) : false;
  const seconds =
    match?.phase === "COUNTDOWN"
      ? Math.max(0, Math.ceil(((match.countdownEndsAt ?? now) - now) / 1000))
      : match?.questionEndsAt
        ? Math.max(0, Math.ceil((match.questionEndsAt - now) / 1000))
        : null;
  const configure = () => {
    if (selectedTopics.length) {
      api.clearSubmission();
      api.configure({ topicIds: selectedTopics, roundCount: 5, questionTimerSeconds: timer, includeCoding });
    }
    setSettingsOpen(false);
  };
  const leave = () => {
    if (
      window.confirm(
        match && ["COUNTDOWN", "QUESTION", "REVEAL", "PAUSED"].includes(match.phase)
          ? "Leave and forfeit this match? Your opponent will win."
          : "Leave this room?",
      )
    ) {
      api.leave();
      clearSession();
      navigate("/", { replace: true });
    }
  };
  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatText.trim()) return;
    api.sendChat(chatText);
    setChatText("");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard is optional */
    }
  };
  const submit = () => {
    if (!match?.question || isSubmitted || match.phase !== "QUESTION") return;
    const sequence =
      match.question.type === "ordered-sequence" ||
      (match.question.type === "graph" &&
        ["bfs-order", "dfs-order", "adjacency"].includes(match.question.operation ?? ""));
    const value = sequence ? ordered : answer;
    api.clearSubmission();
    api.submit({ questionId: match.question.id, answer: value });
  };

  if (!name || !roomId) return null;
  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-8">
          <button className="icon-button" onClick={leave} aria-label="Leave room">
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              {match ? phaseLabel(match.phase) : "connecting"} ·{" "}
              {match?.source === "public" ? "public queue" : "private 1v1"}
            </p>
            <p className="truncate font-mono text-sm text-muted">
              {self?.name ?? name} <span className="text-line">vs</span> {opponent?.name ?? "open seat"}
            </p>
          </div>
          <button className="code-pill" onClick={copy}>
            <span>{roomId}</span>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            className="icon-button relative"
            onClick={() => setChatOpen((open) => !open)}
            aria-label="Toggle chat"
          >
            <MessageCircle size={17} />
            {api.messages.length > 0 && <span className="badge">{Math.min(99, api.messages.length)}</span>}
          </button>
          <button className="button button-danger hidden sm:flex" onClick={leave}>
            <LogOut size={14} /> leave
          </button>
        </div>
      </header>
      {api.connection !== "connected" && !match?.pause && (
        <div className="border-b border-gold/20 bg-gold/10 px-4 py-2 text-center font-mono text-xs text-gold">
          <WifiOff className="mr-2 inline" size={14} />
          reconnecting to the server…
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        {api.errorNotice && (
          <div className="notice-error mb-5">
            <ShieldAlert size={16} />
            {api.errorNotice}
          </div>
        )}
        {codingReadyNotice && match?.config.includeCoding && match.phase !== "REMATCH" && (
          <div className="notice-error mb-5 flex items-center justify-between gap-3">
            <span>{codingReadyNotice}</span>
            <button
              className="button button-primary shrink-0"
              onClick={retryCodingReady}
              disabled={codingReadyAttempts.current >= MAX_CODING_READY_ATTEMPTS}
            >
              retry readiness
            </button>
          </div>
        )}
        {!match ? (
          <Loading />
        ) : match.phase === "LOBBY" ||
          match.phase === "SETUP" ||
          match.phase === "READY" ||
          match.phase === "REMATCH" ? (
          <Lobby
            match={match}
            seatId={seatId}
            host={host}
            self={self?.name ?? name}
            opponent={opponent?.name}
            selectedTopics={selectedTopics}
            timer={timer}
            setSelectedTopics={setSelectedTopics}
            setTimer={setTimer}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            includeCoding={includeCoding}
            setIncludeCoding={setIncludeCoding}
            onConfigure={configure}
            onReady={api.ready}
          />
        ) : match.phase === "COUNTDOWN" ? (
          <Countdown seconds={seconds ?? 3} round={match.roundIndex + 1} />
        ) : match.phase === "QUESTION" ? (
          match.question?.type === "coding" ? (
            <CodingQuestionStage
              key={match.question.id}
              match={match}
              seatId={seatId}
              now={now}
              onProgress={api.codingProgress}
              onComplete={api.codingComplete}
            />
          ) : (
            <QuestionStage
              match={match}
              seatId={seatId}
              opponent={opponent?.name}
              seconds={seconds}
              answer={answer}
              setAnswer={setAnswer}
              ordered={ordered}
              setOrdered={setOrdered}
              submitted={isSubmitted}
              submit={submit}
              lastSubmission={isSubmitted ? api.lastSubmission : null}
            />
          )
        ) : match.phase === "REVEAL" ? (
          <Reveal match={match} seatId={seatId} now={now} onSkip={api.skipReveal} />
        ) : match.phase === "PAUSED" ? (
          <Paused pause={match.pause} now={now} />
        ) : (
          <Results match={match} selfSeatId={seatId} onRematch={api.rematch} onHome={leave} />
        )}
      </main>
      <Chat
        open={chatOpen}
        messages={api.messages}
        value={chatText}
        setValue={setChatText}
        onClose={() => setChatOpen(false)}
        onSend={sendChat}
        self={self?.name ?? name}
      />
    </div>
  );
}

const Lobby = ({
  match,
  seatId,
  host,
  self,
  opponent,
  selectedTopics,
  timer,
  setSelectedTopics,
  setTimer,
  settingsOpen,
  setSettingsOpen,
  includeCoding,
  setIncludeCoding,
  onConfigure,
  onReady,
}: {
  match: MatchPublicState;
  seatId: string | null;
  host: boolean;
  self: string;
  opponent?: string;
  selectedTopics: TopicId[];
  timer: number;
  setSelectedTopics: (topics: TopicId[]) => void;
  setTimer: (timer: number) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  includeCoding: boolean;
  setIncludeCoding: (include: boolean) => void;
  onConfigure: () => void;
  onReady: () => void;
}) => (
  <section className="mx-auto max-w-5xl py-6 sm:py-14">
    <div className="text-center">
      <p className="eyebrow text-gold">{match.phase === "REMATCH" ? "new round" : "room lobby"}</p>
      <h1 className="display mt-3 text-5xl sm:text-7xl">lock in.</h1>
      <p className="mx-auto mt-4 max-w-lg text-muted">
        Both guests ready up when the pool and timer feel right. Five rounds. One server clock.
      </p>
      <button className="code-pill mx-auto mt-6" onClick={() => navigator.clipboard.writeText(match.roomId)}>
        {match.roomId} <Copy size={14} />
      </button>
    </div>
    <div className="mt-10 grid gap-4 sm:grid-cols-2">
      <SeatCard label="you" name={self} ready={Boolean(seatId && match.ready[seatId])} />
      <SeatCard
        label="opponent"
        name={opponent ?? "waiting for a guest"}
        ready={Boolean(opponent && Object.entries(match.ready).find(([id]) => id !== seatId)?.[1])}
        empty={!opponent}
      />
    </div>
    {host && (
      <div className="panel mt-5 p-5">
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <span>
            <span className="eyebrow text-gold">host controls</span>
            <span className="mt-1 block font-semibold">
              {selectedTopics.length} topics · {timer}s per non-coding question
              {includeCoding ? " · 60s per coding round" : ""}
            </span>
          </span>
          <ChevronDown className={settingsOpen ? "rotate-180 text-gold" : "text-muted"} size={17} />
        </button>
        {settingsOpen && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  className={`topic-chip ${selectedTopics.includes(topic.id) ? "topic-chip-active" : ""}`}
                  onClick={() =>
                    setSelectedTopics(
                      selectedTopics.includes(topic.id)
                        ? selectedTopics.filter((item) => item !== topic.id)
                        : [...selectedTopics, topic.id],
                    )
                  }
                >
                  {topic.label}
                  {selectedTopics.includes(topic.id) && <Check size={14} />}
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={includeCoding}
                onChange={(event) => setIncludeCoding(event.target.checked)}
              />
              include reviewed browser C rounds (results are client-reported; no anti-cheat guarantee)
            </label>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-muted">Timer</span>
              <select className="field w-auto" value={timer} onChange={(event) => setTimer(Number(event.target.value))}>
                <option value={60}>60 sec</option>
                <option value={90}>90 sec</option>
                <option value={120}>120 sec</option>
                <option value={300}>5 min</option>
              </select>
              <button className="button button-primary ml-auto" onClick={onConfigure}>
                save settings
              </button>
            </div>
          </div>
        )}
      </div>
    )}
    <button className="button button-primary mx-auto mt-7 flex min-w-64" disabled={!opponent} onClick={onReady}>
      <Check size={16} /> {seatId && match.ready[seatId] ? "unready" : "ready up"}
    </button>
  </section>
);

const SeatCard = ({ label, name, ready, empty }: { label: string; name: string; ready: boolean; empty?: boolean }) => (
  <article className={`panel p-6 ${empty ? "border-dashed" : ""}`}>
    <div className="flex items-center justify-between">
      <span className="grid size-11 place-items-center rounded-full border border-line bg-ink text-gold">
        <Users size={19} />
      </span>
      <span className={`status-pill ${ready ? "status-good" : ""}`}>
        {ready ? "ready" : empty ? "open seat" : "not ready"}
      </span>
    </div>
    <p className="eyebrow mt-8">{label}</p>
    <p className={`mt-2 text-xl font-semibold ${empty ? "text-muted" : ""}`}>{name}</p>
  </article>
);

const Countdown = ({ seconds, round }: { seconds: number; round: number }) => (
  <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center text-center">
    <p className="eyebrow text-gold">round {round} of 5</p>
    <p className="display mt-4 text-[9rem] leading-none text-gold">{seconds}</p>
    <p className="mt-5 text-muted">Get your scratch paper ready. The next prompt is coming.</p>
  </section>
);

const CodingQuestionStage = ({
  match,
  seatId,
  now,
  onProgress,
  onComplete,
}: {
  match: MatchPublicState;
  seatId: string | null;
  now: number;
  onProgress: (status: "compiling" | "running") => void;
  onComplete: (result: {
    questionId: string;
    passed: boolean;
    tests: CTestResult[];
    outcome: "success" | "compile-error" | "runtime-error" | "timeout";
  }) => void;
}) => {
  const question = match.question;
  const problem = question?.type === "coding" ? question.problem : undefined;
  const [code, setCode] = useState(problem?.starterCode ?? "");
  const [outcome, setOutcome] = useState<CExecutionOutcome | null>(null);
  const [runPending, setRunPending] = useState(false);
  const runInFlight = useRef(false);
  if (!question || question.type !== "coding" || !problem) return null;
  const submitted = Boolean(seatId && match.submissions[seatId]?.submitted);
  const complete = (result: CExecutionOutcome) => {
    setOutcome(result);
    onComplete({
      questionId: question.id,
      passed: result.kind === "success" && result.passed,
      tests: result.tests,
      outcome: result.kind === "success" ? "success" : result.kind,
    });
  };
  const run = async () => {
    if (runInFlight.current || submitted) return;
    runInFlight.current = true;
    setRunPending(true);
    try {
      onProgress("compiling");
      complete(await runCInWorker(problem, code));
    } catch (error) {
      complete({
        kind: "runtime-error",
        stdout: "",
        stderr: error instanceof Error ? error.message : "The browser C runner failed.",
        tests: [],
      });
    } finally {
      runInFlight.current = false;
      setRunPending(false);
    }
  };
  return (
    <section className="mx-auto max-w-5xl py-6 sm:py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow text-gold">coding round · browser worker</p>
          <h1 className="display mt-3 text-5xl">run the solution.</h1>
        </div>
        <div className="timer">
          <Clock3 size={16} />
          {match.questionEndsAt ? Math.max(0, Math.ceil((match.questionEndsAt - now) / 1000)) : 0}s
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-muted">
        {problem.description} The server receives only typed progress and test results, never source code.
      </p>
      <div className="mt-7 panel overflow-hidden">
        <div className="border-b border-line bg-ink px-4 py-3 font-mono text-xs text-gold">
          locked · {problem.functionSignature} {"{"}
        </div>
        <Editor
          height="min(52vh, 500px)"
          language="c"
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value ?? "")}
          options={{
            minimap: { enabled: false },
            readOnly: submitted || runPending,
            wordWrap: "on",
            scrollBeyondLastLine: false,
          }}
        />
        <div className="flex items-center justify-between border-t border-line p-4">
          <span className="text-xs text-muted">Local-only execution · no anti-cheat guarantee</span>
          <button className="button button-primary" onClick={run} disabled={submitted || runPending || !code.trim()}>
            <Zap size={15} /> {runPending ? "running…" : "run tests"}
          </button>
        </div>
      </div>
      {outcome && (
        <div className="panel mt-5 p-5 text-sm">
          <p className="eyebrow">runner result</p>
          <p className="mt-2">
            {outcome.kind === "success" && outcome.passed
              ? "all tests passed"
              : outcome.kind === "success"
                ? "tests need attention"
                : outcome.kind === "timeout"
                  ? `${outcome.phase} timed out`
                  : outcome.kind}
          </p>
          {outcome.tests.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {outcome.tests.map((test) => (
                <div
                  key={test.index}
                  className="flex items-center justify-between rounded border border-line px-3 py-2"
                >
                  <span>{test.name}</span>
                  <span className={test.passed ? "text-green-300" : "text-red-300"}>
                    {test.passed ? "PASS" : "FAIL"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const QuestionStage = ({
  match,
  seatId,
  opponent,
  seconds,
  answer,
  setAnswer,
  ordered,
  setOrdered,
  submitted,
  submit,
  lastSubmission,
}: {
  match: MatchPublicState;
  seatId: string | null;
  opponent?: string;
  seconds: number | null;
  answer: string | number | boolean | string[];
  setAnswer: (answer: string | number | boolean | string[]) => void;
  ordered: string[];
  setOrdered: (items: string[]) => void;
  submitted: boolean;
  submit: () => void;
  lastSubmission: { correct: boolean; total: number } | null;
}) => {
  const question = match.question;
  if (!question) return null;
  const opponentSeat = Object.keys(match.submissions).find((id) => id !== seatId);
  const opponentSubmitted = opponentSeat ? match.submissions[opponentSeat]?.submitted : false;
  return (
    <section className="mx-auto max-w-4xl py-3 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-gold">
            question {match.roundIndex + 1} / {match.totalRounds}
          </p>
          <p className="mt-1 text-sm text-muted">
            {topicName(question.topicId)} · {question.difficulty}
          </p>
        </div>
        <div className={`timer ${seconds !== null && seconds <= 10 ? "timer-hot" : ""}`}>
          <Clock3 size={16} />
          {seconds ?? "--"}s
        </div>
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <article className="panel p-6 sm:p-9">
          <div className="flex items-start justify-between gap-5">
            <h1 className="text-2xl font-semibold leading-snug sm:text-4xl">{question.prompt}</h1>
            <span className="type-pill">{typeLabel(question.type)}</span>
          </div>
          <QuestionArtifact question={question} />
          <AnswerControl
            question={question}
            answer={answer}
            setAnswer={setAnswer}
            ordered={ordered}
            setOrdered={setOrdered}
            disabled={submitted}
          />
          <button
            className="button button-primary mt-8 w-full"
            disabled={submitted || !hasAnswer(question, answer, ordered)}
            onClick={submit}
          >
            {submitted ? (
              <>
                <Check size={16} /> answer locked
              </>
            ) : (
              <>
                <Zap size={16} /> submit answer
              </>
            )}
          </button>
          {lastSubmission && (
            <p className="mt-4 text-center text-sm text-muted" role="status">
              Server received your answer.{" "}
              {lastSubmission.correct ? "Correctness confirmed." : "Keep going; reveal is after the round."}
            </p>
          )}
        </article>
        <aside className="space-y-3">
          <MiniScore
            label="you"
            name="your score"
            score={seatId ? (match.scores[seatId]?.total ?? 0) : 0}
            submitted={submitted}
          />
          <MiniScore
            label="opponent"
            name={opponent ?? "opponent"}
            score={opponentSeat ? (match.scores[opponentSeat]?.total ?? 0) : 0}
            submitted={opponentSubmitted}
          />
          <div className="notice-info">
            <CircleHelp size={16} />
            <p>
              Correctness is worth <strong>1,000</strong>. Speed can add up to 300.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
};

const AnswerControl = ({
  question,
  answer,
  setAnswer,
  ordered,
  setOrdered,
  disabled,
}: {
  question: PublicQuestion;
  answer: string | number | boolean | string[];
  setAnswer: (answer: string | number | boolean | string[]) => void;
  ordered: string[];
  setOrdered: (items: string[]) => void;
  disabled: boolean;
}) => {
  if (question.type === "multiple-choice")
    return (
      <div className="mt-9 grid gap-3">
        {question.options?.map((option) => (
          <button
            key={option.id}
            disabled={disabled}
            className={`answer-option ${answer === option.id ? "answer-option-active" : ""}`}
            onClick={() => setAnswer(option.id)}
          >
            <span className="option-key">{option.id}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  if (
    question.type === "ordered-sequence" ||
    (question.type === "graph" && ["bfs-order", "dfs-order", "adjacency"].includes(question.operation ?? ""))
  )
    return (
      <div className="mt-9">
        <p className="field-label">
          {question.type === "graph" ? graphAnswerLabel(question.operation) : "tap items in order"}
        </p>
        <div className="mt-3 grid gap-2">
          {(question.type === "graph" ? question.graph?.nodes : question.items)?.map((item) => (
            <button
              key={item.id}
              disabled={disabled || ordered.includes(item.id)}
              className={`answer-option ${ordered.includes(item.id) ? "opacity-40" : ""}`}
              onClick={() => setOrdered([...ordered, item.id])}
            >
              <span className="option-key">{ordered.indexOf(item.id) + 1 || "·"}</span>
              {item.label}
            </button>
          ))}
        </div>
        {ordered.length > 0 && (
          <button className="mt-3 text-xs text-muted underline" onClick={() => setOrdered([])}>
            reset order
          </button>
        )}
      </div>
    );
  if (question.type === "graph" && question.operation === "reachability")
    return (
      <div className="mt-9 grid gap-3 sm:grid-cols-2">
        <button
          disabled={disabled}
          className={`answer-option ${answer === true ? "answer-option-active" : ""}`}
          onClick={() => setAnswer(true)}
        >
          <span className="option-key">yes</span>reachable
        </button>
        <button
          disabled={disabled}
          className={`answer-option ${answer === false ? "answer-option-active" : ""}`}
          onClick={() => setAnswer(false)}
        >
          <span className="option-key">no</span>not reachable
        </button>
      </div>
    );
  if (question.type === "code-output")
    return (
      <textarea
        disabled={disabled}
        className="field mt-9 min-h-32 font-mono"
        value={typeof answer === "string" ? answer : ""}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="write the output, one line at a time"
      />
    );
  return (
    <input
      disabled={disabled}
      type={question.type === "numeric" ? "number" : "text"}
      className="field mt-9 text-lg"
      value={typeof answer === "string" || typeof answer === "number" ? answer : ""}
      onChange={(event) => setAnswer(question.type === "numeric" ? event.target.value : event.target.value)}
      placeholder={question.unit ? `answer in ${question.unit}` : "type your answer"}
    />
  );
};
const hasAnswer = (question: PublicQuestion, answer: string | number | boolean | string[], ordered: string[]) => {
  if (
    question.type === "ordered-sequence" ||
    (question.type === "graph" && ["bfs-order", "dfs-order", "adjacency"].includes(question.operation ?? ""))
  )
    return (
      ordered.length ===
      (question.type === "ordered-sequence"
        ? (question.orderLength ?? question.items?.length ?? 0)
        : (question.answerLength ?? question.graph?.nodes.length ?? 0))
    );
  if (question.type === "graph" && question.operation === "reachability") return typeof answer === "boolean";
  return String(answer).trim().length > 0;
};
const graphAnswerLabel = (operation?: string) =>
  operation === "adjacency"
    ? "tap neighbors in displayed order"
    : operation === "dfs-order"
      ? "tap DFS preorder"
      : "tap BFS order";
const QuestionArtifact = ({ question }: { question: PublicQuestion }) => {
  if (question.type === "code-output")
    return (
      <pre className="code-editor mt-8" aria-label="curated C code">
        <code>{question.code}</code>
      </pre>
    );
  if (question.type !== "graph" || !question.graph) return null;
  const positions = new Map(question.graph.nodes.map((node) => [node.id, node]));
  return (
    <div className="graph-card mt-8">
      <svg
        className="graph-svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${question.graph.directed ? "Directed" : "Undirected"} graph diagram`}
      >
        <defs>
          <marker id={`arrow-${question.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
          </marker>
        </defs>
        {question.graph.edges.map((edge, index) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const points = graphEdgePoints(from, to);
          return (
            <line
              key={`${edge.from}-${edge.to}-${index}`}
              {...points}
              markerEnd={question.graph?.directed ? `url(#arrow-${question.id})` : undefined}
            />
          );
        })}
        {question.graph.nodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
            <circle r="6" />
            <text y="1.5">{node.label}</text>
          </g>
        ))}
      </svg>
      <p className="graph-caption">
        {question.graph.directed ? "arrows show direction" : "undirected edges"} · {graphQueryLabel(question)}
      </p>
    </div>
  );
};
const graphQueryLabel = (question: PublicQuestion) =>
  question.operation === "reachability"
    ? `${nodeLabel(question, question.startNode)} → ${nodeLabel(question, question.targetNode)}`
    : question.operation === "shortest-path"
      ? `${nodeLabel(question, question.startNode)} → ${nodeLabel(question, question.targetNode)} · shortest path`
      : question.operation === "adjacency"
        ? `neighbors of ${nodeLabel(question, question.nodeId)}`
        : `${question.operation === "dfs-order" ? "DFS" : "BFS"} from ${nodeLabel(question, question.startNode)}`;
const nodeLabel = (question: PublicQuestion, id?: string) =>
  question.graph?.nodes.find((node) => node.id === id)?.label ?? id ?? "node";
const MiniScore = ({
  label,
  name,
  score,
  submitted,
}: {
  label: string;
  name: string;
  score: number;
  submitted: boolean;
}) => (
  <div className="panel p-4">
    <div className="flex items-center justify-between">
      <span className="eyebrow">{label}</span>
      {submitted && <Check className="text-green-300" size={15} />}
    </div>
    <p className="mt-2 truncate text-sm text-muted">{name}</p>
    <p className="mt-2 font-mono text-xl text-gold">{score.toLocaleString()}</p>
  </div>
);

const Reveal = ({
  match,
  seatId,
  now,
  onSkip,
}: {
  match: MatchPublicState;
  seatId: string | null;
  now: number;
  onSkip: () => void;
}) => {
  const question = match.revealedQuestion;
  const skipped = Boolean(seatId && match.revealSkips[seatId]);
  const seconds = Math.max(0, Math.ceil(((match.revealEndsAt ?? now) - now) / 1000));
  return (
    <section className="mx-auto max-w-3xl py-6 sm:py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow text-gold">round reveal · {match.history.at(-1)?.round ?? match.roundIndex + 1}</p>
          <h1 className="display mt-3 text-5xl">review the reasoning.</h1>
        </div>
        <div className="timer">
          <Clock3 size={16} />
          {seconds}s
        </div>
      </div>
      <div className="panel mt-8 p-7 text-left">
        <p className="eyebrow">answer</p>
        <p className="mt-2 text-2xl font-semibold text-gold">
          {question ? formatAnswer(question.answer, question) : "Answer unavailable"}
        </p>
        <p className="eyebrow mt-7">explanation</p>
        <p className="mt-2 leading-7 text-muted">{question?.explanation}</p>
        {question?.type === "graph" && (
          <p className="mt-4 rounded border border-gold/20 bg-gold/5 p-3 text-sm text-muted">
            Graph reasoning: follow the displayed{" "}
            {question.operation === "reachability"
              ? "directed reachability"
              : question.operation === "shortest-path"
                ? "unit-edge paths"
                : `${question.operation} traversal`}{" "}
            rules and node order.
          </p>
        )}
        {question?.type === "code-output" && (
          <p className="mt-4 rounded border border-gold/20 bg-gold/5 p-3 text-sm text-muted">
            C reasoning: evaluate the curated fragment using the language rules described in the prompt; no code was
            executed.
          </p>
        )}
        <p className="mt-5 text-sm text-muted">
          <strong className="text-cream">Assumptions:</strong> {question?.assumptions.join(" · ")}
        </p>
        <p className="mt-3 text-xs text-muted">
          <strong className="text-cream">Provenance:</strong> {question?.provenance.source} —{" "}
          {question?.provenance.note}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {skipped ? "You skipped. Your opponent can keep reviewing." : "Take a moment to review before continuing."}{" "}
          {Object.values(match.revealSkips).filter(Boolean).length}/2 skipped
        </p>
        <button className="button button-primary" onClick={onSkip} disabled={skipped}>
          {skipped ? "reveal skipped" : "skip to next round"}
        </button>
      </div>
    </section>
  );
};

const Paused = ({ pause, now }: { pause: MatchPublicState["pause"]; now: number }) => (
  <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center text-center">
    <WifiOff className="text-gold" size={34} />
    <p className="eyebrow mt-6 text-gold">match paused</p>
    <h1 className="display mt-3 text-4xl">waiting for {pause?.seatName ?? "a guest"}</h1>
    <p className="mt-4 text-muted">Both players are paused. Timers resume only when the guest reconnects.</p>
    <p className="mt-7 font-mono text-2xl text-gold">
      {pause ? Math.max(0, Math.ceil((pause.expiresAt - now) / 1000)) : 0}s
    </p>
  </section>
);

const Results = ({
  match,
  selfSeatId,
  onRematch,
  onHome,
}: {
  match: MatchPublicState;
  selfSeatId: string | null;
  onRematch: () => void;
  onHome: () => void;
}) => {
  const winner = match.winnerSeatId;
  const won = winner === selfSeatId;
  return (
    <section className="mx-auto max-w-4xl py-6 sm:py-12">
      <div className="text-center">
        <Trophy className="mx-auto text-gold" size={34} />
        <p className="eyebrow mt-6 text-gold">
          {match.endReason === "completed" ? "five-round results" : "match outcome"}
        </p>
        <h1 className="display mt-3 text-6xl">{winner ? (won ? "you win" : "good fight") : "draw"}</h1>
        <p className="mt-4 text-muted">Correctness leads. Speed breaks ties only after correct answers are counted.</p>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {Object.entries(match.scores).map(([id, score]) => (
          <article key={id} className={`panel p-5 ${id === selfSeatId ? "border-gold/50" : ""}`}>
            <p className="eyebrow">{id === selfSeatId ? "you" : "opponent"}</p>
            <p className="mt-2 font-mono text-3xl text-gold">{score.total.toLocaleString()}</p>
            <p className="mt-2 text-sm text-muted">
              {score.correct} correct ·{" "}
              {score.responseMs ? `${(score.responseMs / 1000).toFixed(1)}s response time` : "no responses"}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button className="button button-primary" onClick={onRematch}>
          <RotateCcw size={16} /> rematch
        </button>
        <button className="button button-ghost" onClick={onHome}>
          <LogOut size={16} /> leave room
        </button>
      </div>
      <div className="mt-10 space-y-2">
        <p className="eyebrow">round review</p>
        {match.history.map((round) => (
          <details key={round.round} className="panel group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span>
                <span className="eyebrow">round {round.round}</span>
                <span className="ml-4 font-medium">{round.question.prompt}</span>
              </span>
              <ChevronDown className="group-open:rotate-180" size={16} />
            </summary>
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <p className="text-gold">Answer: {formatAnswer(round.question.answer, round.question)}</p>
              <p className="mt-2 text-muted">{round.question.explanation}</p>
              <p className="mt-3 text-xs text-muted">Assumptions: {round.question.assumptions.join(" · ")}</p>
              <p className="mt-3 text-xs text-muted">
                Provenance: {round.question.provenance.source} — {round.question.provenance.note}
              </p>
            </div>
          </details>
        ))}
      </div>
      <TopicPerformanceGrid summary={match.topicSummary} />
    </section>
  );
};
const formatAnswer = (
  answer: string | number | boolean | string[],
  question?: { type: string; graph?: { nodes: Array<{ id: string; label: string }> } },
) => {
  if (!Array.isArray(answer)) return String(answer);
  if (question?.type === "graph")
    return answer.map((id) => question.graph?.nodes.find((node) => node.id === id)?.label ?? id).join(" → ");
  return answer.join(" → ");
};
const TopicPerformanceGrid = ({ summary }: { summary: MatchPublicState["topicSummary"] }) => (
  <section className="mt-10">
    <p className="eyebrow">current-run topic performance</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {TOPICS.map((topic) => {
        const item = summary[topic.id];
        return (
          <div key={topic.id} className="panel flex items-center justify-between p-4">
            <span className="text-sm">{topic.label}</span>
            <span className="text-right font-mono text-xs text-muted">
              {item?.attempted ?? 0} attempted · {item?.correct ?? 0} correct · {item?.incorrect ?? 0} incorrect
              <br />
              <span className="text-gold">
                {Math.round((item?.accuracy ?? 0) * 100)}% ·{" "}
                {(item?.responseMs ?? 0) ? `${((item?.responseMs ?? 0) / 1000).toFixed(1)}s` : "—"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  </section>
);

const Chat = ({
  open,
  messages,
  value,
  setValue,
  onClose,
  onSend,
  self,
}: {
  open: boolean;
  messages: Array<{ id: string; type: "system" | "user"; sender: string; text: string }>;
  value: string;
  setValue: (value: string) => void;
  onClose: () => void;
  onSend: (event: React.FormEvent) => void;
  self: string;
}) => (
  <aside
    className={`fixed bottom-0 right-0 top-16 z-40 flex w-[min(24rem,94vw)] flex-col border-l border-line bg-panel shadow-2xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
  >
    <div className="flex items-center justify-between border-b border-line p-5">
      <div>
        <p className="eyebrow text-gold">secondary channel</p>
        <h2 className="font-semibold">room chat</h2>
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Close chat">
        <X size={16} />
      </button>
    </div>
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">No messages yet.</p>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={
              message.type === "system"
                ? "rounded bg-ink p-3 text-center text-xs text-muted"
                : message.sender === self
                  ? "ml-6"
                  : "mr-6"
            }
          >
            <p className="eyebrow">{message.sender === self ? "you" : message.sender}</p>
            <p className="mt-1 rounded border border-line bg-ink p-3 text-sm">{message.text}</p>
          </div>
        ))
      )}
    </div>
    <form className="flex gap-2 border-t border-line p-3" onSubmit={onSend}>
      <input
        className="field min-w-0"
        maxLength={280}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="message (1/sec)"
      />
      <button className="button button-primary px-3" aria-label="Send">
        <Send size={15} />
      </button>
    </form>
  </aside>
);
const Loading = () => (
  <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center text-center">
    <div className="spinner" />
    <p className="eyebrow mt-6">joining secure guest seat</p>
    <p className="mt-3 text-muted">Syncing the room state…</p>
  </section>
);
const phaseLabel = (phase: string) =>
  ({
    LOBBY: "lobby",
    SETUP: "setup",
    READY: "ready check",
    REMATCH: "rematch lobby",
    COUNTDOWN: "countdown",
    QUESTION: "live question",
    REVEAL: "reveal",
    RESULTS: "results",
    PAUSED: "paused",
    FORFEIT: "forfeit",
    ABANDONED: "abandoned",
    EXPIRED: "expired",
  })[phase] ?? phase.toLowerCase();
const topicName = (id: string) => TOPICS.find((topic) => topic.id === id)?.label ?? id;
const typeLabel = (type: string) =>
  ({
    "multiple-choice": "selected response",
    numeric: "numeric",
    "short-answer": "short answer",
    "code-output": "C trace",
    "ordered-sequence": "ordered sequence",
    graph: "graph reasoning",
  })[type] ?? type;
