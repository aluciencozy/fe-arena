import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleAlert, Play, RotateCcw } from "lucide-react";
import { AppSettings } from "@/components/AppSettings";
import { CRunnerProgress } from "@/components/CRunnerProgress";
import { CRunnerStatusLine } from "@/components/CRunnerStatusLine";
import { Select } from "@/components/ui/select";
import { connectSocket, scheduleSocketDisconnect, socket, socketUrl } from "@/lib/socket";
import { socketConnectionErrorMessage, socketDisconnectedMessage } from "@/lib/socket-errors";
import { CODING_CAPABILITY_MESSAGE, isCodingCapabilityAvailable } from "@/lib/coding-capability";
import { isDevelopmentBuild } from "@/lib/environment";
import {
  getCPrewarmStatus,
  prewarmCWorker,
  runCInWorker,
  type CExecutionOutcome,
  type CRunnerStatus,
  type CTestResult,
} from "@/lib/c-runner";
import { DeadlineTimer } from "@/components/DeadlineTimer";
import { graphEdgePoints, graphTextAlternative } from "@/lib/graph";
import { QuestionPrompt } from "@/components/QuestionPrompt";
import { DEFAULT_TIMER_SECONDS, formatQuestionTimer, QUESTION_TIMER_OPTIONS } from "@/lib/question-timer";
import {
  TOPICS,
  type PublicAnswer,
  type PublicQuestion,
  type TopicId,
  type TopicPerformance,
} from "../../../shared/domain";

type SoloState = {
  phase: "QUESTION" | "RESULT" | "COMPLETE";
  question: PublicQuestion | null;
  revealedQuestion: {
    type: PublicQuestion["type"];
    answer: PublicAnswer;
    explanation: string;
    assumptions: string[];
    provenance: { source: string; note: string };
  } | null;
  questionEndsAt: number | null;
  result: { correct: boolean; score: { total: number } } | null;
  topicSummary: Record<string, TopicPerformance>;
  runScore: number;
  runCorrect: number;
  runTotal: number;
};
type SoloStartRequest = { topicIds: TopicId[]; count: number; timerSeconds: number; supportsCoding: boolean };
const DEFAULT_TOPICS: TopicId[] = [
  "arrays-memory",
  "linked-lists",
  "stacks",
  "queues",
  "binary-trees",
  "sorting",
  "recursion",
  "analysis-mathematics",
];
export default function Solo() {
  const [topics, setTopics] = useState<TopicId[]>(DEFAULT_TOPICS);
  const [timer, setTimer] = useState(DEFAULT_TIMER_SECONDS);
  const [state, setState] = useState<SoloState | null>(null);
  const [answer, setAnswer] = useState<string | number | boolean | string[]>("");
  const [ordered, setOrdered] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">(
    socket.connected ? "connected" : "connecting",
  );
  const connectionRef = useRef(socket.connected);
  const stateRef = useRef<SoloState | null>(null);
  const pendingStart = useRef<SoloStartRequest | null>(null);
  const capabilityReady = isCodingCapabilityAvailable();
  const [workerStatus, setWorkerStatus] = useState<CRunnerStatus>(() => getCPrewarmStatus());
  const [prewarmError, setPrewarmError] = useState("");
  const startPrewarm = useCallback(() => {
    if (!capabilityReady) return;
    setPrewarmError("");
    void prewarmCWorker({ onProgress: setWorkerStatus }).catch((failure) => {
      setPrewarmError(failure instanceof Error ? failure.message : "The browser C runner could not initialize.");
    });
  }, [capabilityReady]);
  useEffect(() => {
    if (!capabilityReady) return;
    const timer = window.setTimeout(startPrewarm, 0);
    return () => window.clearTimeout(timer);
  }, [capabilityReady, startPrewarm]);
  useEffect(() => {
    let active = true;
    const onState = (next: SoloState) => {
      stateRef.current = next;
      setState(next);
      setAnswer("");
      setOrdered([]);
    };
    const onConnect = () => {
      const restored = !connectionRef.current;
      connectionRef.current = true;
      const queuedStart = pendingStart.current;
      pendingStart.current = null;
      setConnection("connected");
      if (restored && stateRef.current) {
        stateRef.current = null;
        setState(null);
        setAnswer("");
        setOrdered([]);
        setError("Connection restored. Start a new run to continue practicing.");
      } else if (restored && !queuedStart) {
        setError("");
      }
      if (queuedStart) {
        setError("");
        socket.emit("solo:start", queuedStart);
      }
    };
    const onDisconnect = () => {
      connectionRef.current = false;
      setConnection("disconnected");
      setError(socketDisconnectedMessage(socketUrl));
    };
    const onConnectError = (reason: unknown) => {
      connectionRef.current = false;
      setConnection("disconnected");
      setError(socketConnectionErrorMessage(reason, socketUrl));
    };
    const onError = (payload: { message?: string } | string) =>
      setError(typeof payload === "string" ? payload : (payload.message ?? "Something went wrong."));
    socket.on("solo:state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("server:error", onError);
    if (socket.connected) {
      connectionRef.current = true;
      queueMicrotask(() => {
        if (active && socket.connected) setConnection("connected");
      });
    } else {
      connectSocket();
    }
    return () => {
      active = false;
      socket.off("solo:state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("server:error", onError);
      scheduleSocketDisconnect();
    };
  }, []);
  const requireConnection = () => {
    if (socket.connected) return true;
    setConnection("connecting");
    setError(socketConnectionErrorMessage(undefined, socketUrl));
    connectSocket();
    return false;
  };
  const startRun = (request: SoloStartRequest) => {
    pendingStart.current = request;
    if (!socket.connected) {
      setConnection("connecting");
      setError("");
      connectSocket();
      return;
    }
    pendingStart.current = null;
    setError("");
    socket.emit("solo:start", request);
  };
  const requireCodingRunner = () => {
    if (!capabilityReady) {
      setError(CODING_CAPABILITY_MESSAGE);
      return false;
    }
    if (workerStatus.state !== "ready") {
      setError("The browser C runner is still warming up. Try again when readiness reaches ready.");
      startPrewarm();
      return false;
    }
    return true;
  };
  const start = () => {
    if (topics.length && requireCodingRunner())
      startRun({ topicIds: topics, count: 5, timerSeconds: timer, supportsCoding: true });
  };
  const startTopic = (topicId: TopicId) => {
    setTopics([topicId]);
    if (requireCodingRunner())
      startRun({ topicIds: [topicId], count: 5, timerSeconds: timer, supportsCoding: true });
  };
  const submit = () => {
    if (!state?.question || !requireConnection()) return;
    const sequence =
      state.question.type === "ordered-sequence" ||
      (state.question.type === "graph" &&
        ["bfs-order", "dfs-order", "adjacency"].includes(state.question.operation ?? ""));
    const value = sequence ? ordered : answer;
    socket.emit("solo:submit", { questionId: state.question.id, answer: value });
  };
  const next = () => {
    if (requireConnection()) socket.emit("solo:next");
  };
  if (!state)
    return (
      <Shell>
        <main className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-gold">
            <ArrowLeft size={15} /> home
          </Link>
          <section className="mt-14 max-w-2xl">
            <p className="eyebrow text-gold">same server grading engine</p>
            <h1 className="display mt-3 text-6xl">solo practice.</h1>
            <p className="mt-5 text-lg leading-8 text-muted">
              A current-run drill with original prompts, one locked answer per question, and the same 1,000 + 300
              scoring model used in a match.
            </p>
            <div className="mt-10 grid gap-2 sm:grid-cols-2">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  className={`topic-chip ${topics.includes(topic.id) ? "topic-chip-active" : ""}`}
                  onClick={() =>
                    setTopics((current) =>
                      current.includes(topic.id) ? current.filter((item) => item !== topic.id) : [...current, topic.id],
                    )
                  }
                >
                  {topic.label}
                  {topics.includes(topic.id) && <Check size={14} />}
                </button>
              ))}
            </div>
            <div className="mt-7 flex items-center justify-between gap-4 border-y border-line py-4">
              <div>
                <p id="solo-timer-label" className="field-label">
                  question timer
                </p>
                <p className="mt-1 text-sm text-muted">{formatQuestionTimer(timer)} · five questions</p>
              </div>
              <Select
                value={String(timer)}
                options={QUESTION_TIMER_OPTIONS}
                onChange={(value) => setTimer(Number(value))}
                containerClassName="w-auto"
                buttonClassName="w-auto"
                ariaLabelledBy="solo-timer-label"
              />
            </div>
            {!capabilityReady && (
              <div className="notice-error mt-7" role="alert">
                <CircleAlert size={16} className="shrink-0" />
                <span>{CODING_CAPABILITY_MESSAGE}</span>
              </div>
            )}
            {isDevelopmentBuild ? (
              <CRunnerProgress
                status={workerStatus}
                error={capabilityReady ? prewarmError : ""}
                onRetry={startPrewarm}
                retryDisabled={!capabilityReady}
              />
            ) : (
              <CRunnerStatusLine
                status={workerStatus}
                error={capabilityReady ? prewarmError : ""}
                onRetry={startPrewarm}
                retryDisabled={!capabilityReady}
              />
            )}
            <button
              className="button button-primary mt-7"
              onClick={start}
              disabled={!topics.length || !capabilityReady || workerStatus.state !== "ready"}
            >
              <BookOpen size={16} /> start five-question run <ArrowRight size={16} />
            </button>
            {error && (
              <p className="mt-4 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            {connection === "connecting" && <p className="mt-3 text-sm text-muted">Connecting to the study server…</p>}
          </section>
        </main>
      </Shell>
    );
  if (state.phase === "COMPLETE")
    return (
      <Shell>
        <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
          <section className="text-center">
            <p className="eyebrow text-gold">run complete</p>
            <h1 className="display mt-3 text-6xl">good work.</h1>
            <p className="mt-5 text-muted">
              {state.runCorrect}/{state.runTotal} correct ·{" "}
              <span className="font-mono text-gold">{state.runScore.toLocaleString()}</span> points
            </p>
          </section>
          <section className="mt-10">
            <p className="eyebrow">current-run topic performance</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {TOPICS.filter((topic) => (state.topicSummary[topic.id]?.attempted ?? 0) > 0).map((topic) => {
                const item = state.topicSummary[topic.id]!;
                return (
                  <div key={topic.id} className="panel flex items-center justify-between p-4">
                    <span className="text-sm">{topic.label}</span>
                    <span className="text-right font-mono text-xs text-muted">
                      {item.attempted} attempted · {item.correct} correct · {item.incorrect} incorrect
                      <br />
                      <span className="text-gold">
                        {Math.round(item.accuracy * 100)}% · {item.score.toLocaleString()} pts ·{" "}
                        {(item.responseMs / 1000).toFixed(1)}s
                      </span>
                    </span>
                    <button className="button button-ghost px-3 py-2 text-xs" onClick={() => startTopic(topic.id)}>
                      practice
                    </button>
                  </div>
                );
              })}
            </div>
            {error && (
              <p className="mt-4 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <p className="mt-4 text-sm text-muted">
              Practice a missed or weak topic directly. Raw answers stay in memory only for this run.
            </p>
          </section>
          <div className="mt-8 flex justify-center gap-3">
            <button className="button button-primary" onClick={() => setState(null)}>
              <RotateCcw size={16} /> new run
            </button>
            <Link className="button button-ghost" to="/">
              <ArrowLeft size={16} /> home
            </Link>
          </div>
        </main>
      </Shell>
    );
  const question = state.question;
  return (
    <Shell>
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-gold">
            <ArrowLeft size={15} /> exit
          </Link>
          <div className="font-mono text-sm text-muted">
            {state.runTotal + (state.phase === "QUESTION" ? 1 : 0)} / 5 · {state.runScore.toLocaleString()} pts
          </div>
        </div>
        {state.phase === "RESULT" && state.revealedQuestion ? (
          <section className="mx-auto mt-20 max-w-2xl text-center">
            <p className="eyebrow text-gold">answer reveal</p>
            <h1 className="display mt-3 text-5xl">{state.result?.correct ? "correct" : "not quite"}</h1>
            {error && (
              <p className="mt-4 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            {connection === "connecting" && <p className="mt-3 text-sm text-muted">Connecting to the study server…</p>}
            <p className="mt-8 rounded border border-gold/30 bg-gold/10 p-5 font-mono text-gold">
              {formatAnswer(state.revealedQuestion.answer)}
            </p>
            <p className="mt-6 leading-7 text-muted">{state.revealedQuestion.explanation}</p>
            {state.revealedQuestion.type === "graph" && (
              <p className="mt-4 text-sm text-muted">
                Graph reasoning: apply the displayed graph operation, edge direction, and node order.
              </p>
            )}
            {state.revealedQuestion.type === "code-output" && (
              <p className="mt-4 text-sm text-muted">
                C reasoning: trace the curated fragment using the language rules; no code was executed.
              </p>
            )}
            <p className="mt-4 text-xs text-muted">Assumptions: {state.revealedQuestion.assumptions.join(" · ")}</p>
            <p className="mt-3 text-xs text-muted">
              Provenance: {state.revealedQuestion.provenance.source} — {state.revealedQuestion.provenance.note}
            </p>
            <button className="button button-primary mt-9" onClick={next}>
              <ArrowRight size={16} /> next prompt
            </button>
          </section>
        ) : (
          question && (
            <section className="mx-auto mt-12 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow text-gold">solo prompt</p>
                  <p className="mt-1 text-sm text-muted">
                    {topicName(question.topicId)} · {question.difficulty}
                  </p>
                </div>
                <DeadlineTimer deadline={state.questionEndsAt} />
              </div>
              {error && (
                <p className="mt-4 text-sm text-red-300" role="alert">
                  {error}
                </p>
              )}
              {connection === "connecting" && (
                <p className="mt-3 text-sm text-muted">Connecting to the study server…</p>
              )}
              {question.type === "coding" ? (
                <SoloCodingQuestionStage
                  key={question.id}
                  question={question}
                  capabilityReady={capabilityReady}
                  connection={connection}
                  onComplete={(result) => socket.emit("solo:coding-complete", result)}
                />
              ) : (
                <article className="panel mt-8 p-6 sm:p-9">
                  <QuestionPrompt className="text-2xl font-semibold leading-snug sm:text-4xl" prompt={question.prompt} />
                  <QuestionArtifact question={question} />
                  <SoloControl
                    question={question}
                    answer={answer}
                    setAnswer={setAnswer}
                    ordered={ordered}
                    setOrdered={setOrdered}
                  />
                  <button
                    className="button button-primary mt-8 w-full"
                    onClick={submit}
                    disabled={connection !== "connected" || !hasAnswer(question, answer, ordered)}
                  >
                    <Check size={16} /> submit once
                  </button>
                </article>
              )}
            </section>
          )
        )}
      </main>
    </Shell>
  );
}
const SoloCodingQuestionStage = ({
  question,
  capabilityReady,
  connection,
  onComplete,
}: {
  question: PublicQuestion;
  capabilityReady: boolean;
  connection: "connecting" | "connected" | "disconnected";
  onComplete: (result: { questionId: string; passed: boolean; tests: CTestResult[]; outcome: "success" }) => void;
}) => {
  const problem = question.problem;
  const [code, setCode] = useState(problem?.starterCode ?? "");
  const [outcome, setOutcome] = useState<CExecutionOutcome | null>(null);
  const [runnerStatus, setRunnerStatus] = useState<CRunnerStatus>(() => getCPrewarmStatus());
  const [runnerError, setRunnerError] = useState("");
  const [runPending, setRunPending] = useState(false);
  const [locked, setLocked] = useState(false);
  if (!problem) return null;
  const run = async () => {
    if (!capabilityReady || connection !== "connected" || runPending || locked) return;
    setRunPending(true);
    setOutcome(null);
    setRunnerError("");
    try {
      const result = await runCInWorker(problem, code, { onProgress: setRunnerStatus });
      setOutcome(result);
      if (result.kind === "success" && result.passed) {
        setLocked(true);
        onComplete({ questionId: question.id, passed: result.passed, tests: result.tests, outcome: "success" });
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : "The browser C runner failed.";
      setRunnerError(failure);
      setOutcome({ kind: "runtime-error", stdout: "", stderr: failure, tests: [] });
    } finally {
      setRunPending(false);
    }
  };
  return (
    <article className="panel mt-8 overflow-hidden">
      <div className="p-6 sm:p-9">
        <p className="eyebrow text-gold">{problem.title}</p>
        <QuestionPrompt className="mt-3 text-2xl font-semibold leading-snug sm:text-4xl" prompt={question.prompt} />
        {!capabilityReady && (
          <div id="solo-c-capability-help" className="notice-error mt-5" role="alert">
            <CircleAlert size={16} className="shrink-0" />
            <span>{CODING_CAPABILITY_MESSAGE}</span>
          </div>
        )}
        {isDevelopmentBuild ? (
          <CRunnerProgress status={runnerStatus} error={runnerError} onRetry={run} retryLabel="retry tests" />
        ) : (
          <div className="mt-5">
            <CRunnerStatusLine
              status={runnerStatus}
              error={runnerError}
              outcome={outcome}
              active={runPending}
              onRetry={run}
            />
          </div>
        )}
        <div className="mt-7 border border-line">
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
              readOnly: runPending || locked,
              wordWrap: "on",
              scrollBeyondLastLine: false,
            }}
          />
          <div className="flex items-center justify-between gap-3 border-t border-line p-4">
            <span className="text-xs text-muted">Run the reviewed tests when you are ready.</span>
            <button
              className="button button-primary"
              onClick={run}
              disabled={!capabilityReady || connection !== "connected" || runPending || locked || !code.trim()}
              aria-describedby={!capabilityReady ? "solo-c-capability-help" : undefined}
            >
              <Play size={15} /> {runPending ? "running…" : locked ? "answer locked" : "run tests"}
            </button>
          </div>
        </div>
        {outcome && (
          <div className="mt-5 rounded border border-line p-4 text-sm" aria-live="polite">
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
                  <div key={test.index} className="flex items-center justify-between rounded border border-line px-3 py-2">
                    <span>{test.name}</span>
                    <span className={test.passed ? "text-green-300" : "text-red-300"}>
                      {test.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(outcome.kind !== "success" || !outcome.passed) && (
              <p className="mt-3 text-xs text-muted">This attempt stayed unlocked. Fix the code or retry the run.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
};
const SoloControl = ({
  question,
  answer,
  setAnswer,
  ordered,
  setOrdered,
}: {
  question: PublicQuestion;
  answer: string | number | boolean | string[];
  setAnswer: (answer: string | number | boolean | string[]) => void;
  ordered: string[];
  setOrdered: (items: string[]) => void;
}) => {
  if (question.type === "multiple-choice")
    return (
      <div className="mt-8 grid gap-3">
        {question.options?.map((option) => (
          <button
            key={option.id}
            className={`answer-option ${answer === option.id ? "answer-option-active" : ""}`}
            onClick={() => setAnswer(option.id)}
          >
            <span className="option-key">{option.id}</span>
            {option.label}
          </button>
        ))}
      </div>
    );
  if (
    question.type === "ordered-sequence" ||
    (question.type === "graph" && ["bfs-order", "dfs-order", "adjacency"].includes(question.operation ?? ""))
  )
    return (
      <div className="mt-8 grid gap-2">
        {(question.type === "graph" ? question.graph?.nodes : question.items)?.map((item) => (
          <button
            key={item.id}
            className={`answer-option ${ordered.includes(item.id) ? "opacity-40" : ""}`}
            disabled={ordered.includes(item.id)}
            onClick={() => setOrdered([...ordered, item.id])}
          >
            <span className="option-key">{ordered.indexOf(item.id) + 1 || "·"}</span>
            {item.label}
          </button>
        ))}
      </div>
    );
  if (question.type === "graph" && question.operation === "reachability")
    return (
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        <button
          className={`answer-option ${answer === true ? "answer-option-active" : ""}`}
          onClick={() => setAnswer(true)}
        >
          <span className="option-key">yes</span>reachable
        </button>
        <button
          className={`answer-option ${answer === false ? "answer-option-active" : ""}`}
          onClick={() => setAnswer(false)}
        >
          <span className="option-key">no</span>not reachable
        </button>
      </div>
    );
  return (
    <textarea
      className="field mt-8 min-h-28 font-mono"
      value={typeof answer === "string" || typeof answer === "number" ? answer : ""}
      onChange={(event) => setAnswer(event.target.value)}
      placeholder={question.type === "numeric" ? "enter a number" : "type your answer"}
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
      <p id={`solo-graph-description-${question.id}`} className="sr-only">
        {graphTextAlternative(question.graph)} Question: apply the displayed graph operation and node order.
      </p>
      <svg
        className="graph-svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${question.graph.directed ? "Directed" : "Undirected"} graph diagram`}
        aria-describedby={`solo-graph-description-${question.id}`}
      >
        <defs>
          <marker id={`solo-arrow-${question.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
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
              markerEnd={question.graph?.directed ? `url(#solo-arrow-${question.id})` : undefined}
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
      <p className="graph-caption">{question.graph.directed ? "arrows show direction" : "undirected edges"}</p>
    </div>
  );
};
const formatAnswer = (answer: PublicAnswer) => {
  if (typeof answer === "object" && !Array.isArray(answer))
    return answer.passed ? "Passed all tests" : `Did not pass (${answer.outcome.replace("-", " ")})`;
  return Array.isArray(answer) ? answer.join(" → ") : String(answer);
};
const topicName = (id: string) => TOPICS.find((topic) => topic.id === id)?.label ?? id;
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-ink text-cream">
    <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-line px-5 py-5 sm:px-8">
      <Link to="/" className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded bg-gold font-black text-ink">FE</span>
        <span className="font-mono text-sm font-bold tracking-[.18em]">ARENA</span>
      </Link>
      <AppSettings />
    </header>
    {children}
  </div>
);
