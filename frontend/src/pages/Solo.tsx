import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3, RotateCcw } from "lucide-react";
import { AppSettings } from "@/components/AppSettings";
import { connectSocket, scheduleSocketDisconnect, socket, socketUrl } from "@/lib/socket";
import { socketConnectionErrorMessage, socketDisconnectedMessage } from "@/lib/socket-errors";
import { graphEdgePoints } from "@/lib/graph";
import { TOPICS, type PublicQuestion, type TopicId, type TopicPerformance } from "../../../shared/domain";

type SoloState = {
  phase: "QUESTION" | "RESULT" | "COMPLETE";
  question: PublicQuestion | null;
  revealedQuestion: {
    type: PublicQuestion["type"];
    answer: string | number | boolean | string[];
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
  const [state, setState] = useState<SoloState | null>(null);
  const [answer, setAnswer] = useState<string | number | boolean | string[]>("");
  const [ordered, setOrdered] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">(
    socket.connected ? "connected" : "disconnected",
  );
  const connectionRef = useRef(socket.connected);
  const stateRef = useRef<SoloState | null>(null);
  useEffect(() => {
    let active = true;
    const onState = (next: SoloState) => {
      setNow(Date.now());
      stateRef.current = next;
      setState(next);
      setAnswer("");
      setOrdered([]);
    };
    const onConnect = () => {
      const restored = !connectionRef.current;
      connectionRef.current = true;
      setConnection("connected");
      if (restored && stateRef.current) {
        stateRef.current = null;
        setState(null);
        setAnswer("");
        setOrdered([]);
        setError("Connection restored. Start a new run to continue practicing.");
      } else if (restored) {
        setError("");
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
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const requireConnection = () => {
    if (socket.connected) return true;
    setConnection("connecting");
    setError(socketConnectionErrorMessage(undefined, socketUrl));
    connectSocket();
    return false;
  };
  const start = () => {
    if (topics.length && requireConnection()) {
      setError("");
      socket.emit("solo:start", { topicIds: topics, count: 5, timerSeconds: 120 });
    }
  };
  const startTopic = (topicId: TopicId) => {
    setTopics([topicId]);
    if (!requireConnection()) return;
    setError("");
    socket.emit("solo:start", { topicIds: [topicId], count: 5, timerSeconds: 120 });
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
            <button className="button button-primary mt-7" onClick={start} disabled={!topics.length}>
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
  const seconds = state.questionEndsAt ? Math.max(0, Math.ceil((state.questionEndsAt - now) / 1000)) : 0;
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
                <span className="timer">
                  <Clock3 size={16} />
                  {seconds}s
                </span>
              </div>
              {error && (
                <p className="mt-4 text-sm text-red-300" role="alert">
                  {error}
                </p>
              )}
              {connection === "connecting" && (
                <p className="mt-3 text-sm text-muted">Connecting to the study server…</p>
              )}
              <article className="panel mt-8 p-6 sm:p-9">
                <h1 className="text-2xl font-semibold leading-snug sm:text-4xl">{question.prompt}</h1>
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
            </section>
          )
        )}
      </main>
    </Shell>
  );
}
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
      <svg
        className="graph-svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${question.graph.directed ? "Directed" : "Undirected"} graph diagram`}
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
const formatAnswer = (answer: string | number | boolean | string[]) =>
  Array.isArray(answer) ? answer.join(" → ") : String(answer);
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
