import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Code2,
  Hash,
  LockKeyhole,
  Menu,
  Radio,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import AuthPanel from "@/components/AuthPanel";
import { AppSettings } from "@/components/AppSettings";
import { Select } from "@/components/ui/select";
import { isPrivateCreateResponseForActiveRequest } from "@/lib/private-create";
import { connectSocket, socket, socketUrl } from "@/lib/socket";
import { socketConnectionErrorMessage, socketDisconnectedMessage } from "@/lib/socket-errors";
import { useGameStore } from "@/store/gameStore";
import { TOPICS, type MatchConfig, type TopicId } from "../../../shared/domain";

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
const normalizeCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

type Notice = { kind: "error" | "info"; text: string } | null;
type PrivateCreateRequest = { requestId: string; username: string; config: MatchConfig };
type PrivateCreateAck = { ok: boolean; roomId?: string; error?: string };
type ActivePrivateCreate = { requestId: string; attempt: number };
export default function Home() {
  const navigate = useNavigate();
  const playerName = useGameStore((state) => state.playerName);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const [name, setName] = useState(playerName);
  const [roomCode, setRoomCode] = useState("");
  const [topics, setTopics] = useState<TopicId[]>(DEFAULT_TOPICS);
  const [timer, setTimer] = useState(90);
  const [view, setView] = useState<"home" | "private" | "join" | "queue">("home");
  const [notice, setNotice] = useState<Notice>(null);
  const [queueExpiresAt, setQueueExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [privateRequestState, setPrivateRequestState] = useState<"idle" | "waiting" | "timed-out">("idle");
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">(
    socket.connected ? "connected" : "disconnected",
  );
  const queuedName = useRef<string | null>(null);
  const queueToken = useRef<string | null>(null);
  const pendingPrivateCreate = useRef<PrivateCreateRequest | null>(null);
  const activePrivateCreate = useRef<ActivePrivateCreate | null>(null);
  const privateCreateAttempt = useRef(0);
  const privateAckTimer = useRef<number | null>(null);
  const validName = name.trim().length > 0;
  const closeTopicDialog = useCallback(() => setView("home"), []);
  const clearPrivateAckTimer = useCallback(() => {
    if (privateAckTimer.current !== null) {
      window.clearTimeout(privateAckTimer.current);
      privateAckTimer.current = null;
    }
  }, []);
  const emitPrivateCreate = useCallback(
    (request: PrivateCreateRequest) => {
      const attempt = privateCreateAttempt.current + 1;
      privateCreateAttempt.current = attempt;
      activePrivateCreate.current = { requestId: request.requestId, attempt };
      clearPrivateAckTimer();
      setBusy(true);
      setPrivateRequestState("waiting");
      privateAckTimer.current = window.setTimeout(() => {
        if (activePrivateCreate.current?.attempt !== attempt) return;
        privateAckTimer.current = null;
        activePrivateCreate.current = null;
        setBusy(false);
        setPrivateRequestState("timed-out");
        setNotice({ kind: "error", text: "Private room creation timed out. Retry with the same request." });
      }, 8_000);
      socket
        .timeout(8_000)
        .emit("room:create-private", request, (timeoutError: Error | null, response: PrivateCreateAck) => {
          if (activePrivateCreate.current?.attempt !== attempt) return;
          clearPrivateAckTimer();
          if (timeoutError) {
            activePrivateCreate.current = null;
            setBusy(false);
            setPrivateRequestState("timed-out");
            setNotice({ kind: "error", text: "Private room creation timed out. Retry with the same request." });
            return;
          }
          if (!response?.ok) {
            activePrivateCreate.current = null;
            pendingPrivateCreate.current = null;
            setBusy(false);
            setPrivateRequestState("idle");
            setNotice({ kind: "error", text: response?.error ?? "The private room could not be created." });
          }
        });
    },
    [clearPrivateAckTimer],
  );
  const config: MatchConfig = useMemo(
    () => ({ topicIds: topics, roundCount: 5, questionTimerSeconds: timer }),
    [timer, topics],
  );

  useEffect(() => {
    const created = (payload: { requestId: string; roomId: string; seatId: string; reconnectToken: string }) => {
      if (!isPrivateCreateResponseForActiveRequest(activePrivateCreate.current?.requestId ?? null, payload.requestId))
        return;
      activePrivateCreate.current = null;
      useGameStore.getState().setSession(payload.seatId, payload.reconnectToken, payload.roomId);
      clearPrivateAckTimer();
      pendingPrivateCreate.current = null;
      setBusy(false);
      setPrivateRequestState("idle");
      navigate(`/room/${payload.roomId}`);
    };
    const queueSeat = (payload: { roomId: string; seatId: string; reconnectToken: string }) => {
      queuedName.current = null;
      queueToken.current = null;
      useGameStore.getState().setSession(payload.seatId, payload.reconnectToken, payload.roomId);
      navigate(`/room/${payload.roomId}`);
    };
    const waiting = (payload: { status: string; expiresAt?: number; queueToken?: string }) => {
      if (payload.status === "waiting") {
        if (payload.queueToken) queueToken.current = payload.queueToken;
        setNotice(null);
        setView("queue");
        setQueueExpiresAt(payload.expiresAt ?? Date.now() + 300_000);
      } else {
        const message =
          payload.status === "expired"
            ? "The public queue expired after five minutes. Join the public queue again to retry."
            : "You left the public queue. Join the public queue again whenever you are ready.";
        queuedName.current = null;
        queueToken.current = null;
        setView("home");
        setQueueExpiresAt(null);
        setNotice({ kind: "info", text: message });
      }
    };
    const onConnect = () => {
      setConnection("connected");
      if (pendingPrivateCreate.current) emitPrivateCreate(pendingPrivateCreate.current);
      if (queuedName.current)
        socket.emit(
          "queue:join",
          queueToken.current
            ? { username: queuedName.current, queueToken: queueToken.current }
            : { username: queuedName.current },
        );
    };
    const onDisconnect = () => {
      setConnection("disconnected");
      if (pendingPrivateCreate.current) {
        setNotice({ kind: "error", text: socketDisconnectedMessage(socketUrl) });
      }
      if (queuedName.current) setNotice({ kind: "error", text: socketDisconnectedMessage(socketUrl) });
    };
    const onConnectError = (reason: unknown) => {
      setConnection("disconnected");
      if (pendingPrivateCreate.current) {
        clearPrivateAckTimer();
        activePrivateCreate.current = null;
        setBusy(false);
        setPrivateRequestState("timed-out");
      } else {
        setBusy(false);
      }
      setNotice({ kind: "error", text: socketConnectionErrorMessage(reason, socketUrl) });
    };
    const failed = (payload: { message?: string } | string) => {
      clearPrivateAckTimer();
      if (pendingPrivateCreate.current) {
        activePrivateCreate.current = null;
        pendingPrivateCreate.current = null;
        setBusy(false);
        setPrivateRequestState("idle");
      }
      setNotice({
        kind: "error",
        text: typeof payload === "string" ? payload : (payload.message ?? "Request failed."),
      });
    };
    socket.on("room:created", created);
    socket.on("queue:seat", queueSeat);
    socket.on("queue:state", waiting);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("server:error", failed);
    return () => {
      clearPrivateAckTimer();
      socket.off("room:created", created);
      socket.off("queue:seat", queueSeat);
      socket.off("queue:state", waiting);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("server:error", failed);
    };
  }, [clearPrivateAckTimer, emitPrivateCreate, navigate]);
  useEffect(() => {
    if (view !== "queue") return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [view]);

  const begin = () => {
    if (!validName) {
      setNotice({ kind: "error", text: "Choose a guest name first." });
      return false;
    }
    setPlayerName(name);
    setNotice(null);
    connectSocket();
    return true;
  };
  const createPrivate = () => {
    if (!begin()) return;
    const request = {
      requestId: crypto.randomUUID(),
      username: name.trim(),
      config,
    } satisfies PrivateCreateRequest;
    activePrivateCreate.current = null;
    pendingPrivateCreate.current = request;
    setBusy(true);
    setPrivateRequestState("waiting");
    if (socket.connected) emitPrivateCreate(request);
    else connectSocket();
  };
  const retryPrivateCreate = () => {
    if (!pendingPrivateCreate.current) return;
    setNotice(null);
    setConnection("connecting");
    connectSocket();
    if (socket.connected) emitPrivateCreate(pendingPrivateCreate.current);
  };
  const joinPrivate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!begin() || roomCode.length !== 6) {
      if (roomCode.length !== 6) setNotice({ kind: "error", text: "Enter a six-character room code." });
      return;
    }
    navigate(`/room/${roomCode}`);
  };
  const joinQueue = () => {
    if (!begin()) return;
    queuedName.current = name.trim();
    queueToken.current = null;
    if (socket.connected) socket.emit("queue:join", { username: queuedName.current });
    setView("queue");
  };
  const retryQueue = () => {
    if (!queuedName.current) return;
    setNotice(null);
    setConnection("connecting");
    connectSocket();
    if (socket.connected) socket.emit("queue:join", { username: queuedName.current });
  };
  const leaveQueue = () => {
    queuedName.current = null;
    queueToken.current = null;
    socket.emit("queue:leave");
    setView("home");
    setQueueExpiresAt(null);
  };
  const toggleTopic = (id: TopicId) =>
    setTopics((current) => (current.includes(id) ? current.filter((topic) => topic !== id) : [...current, id]));
  const queueSeconds = queueExpiresAt ? Math.max(0, Math.ceil((queueExpiresAt - now) / 1000)) : 300;

  if (view === "queue")
    return (
      <Shell>
        <section className="mx-auto flex max-w-xl flex-col items-center py-24 text-center">
          <div className="relative grid size-20 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            <Radio className="animate-pulse" size={28} />
          </div>
          <p className="eyebrow mt-8">public study queue</p>
          <h1 className="display mt-3 text-4xl">finding a study partner</h1>
          <p className="mt-4 max-w-md text-muted">
            The public room uses the published reviewed bank; unpublished intro rows are excluded. It has five rounds
            and a five-minute question timer.
          </p>
          {notice && (
            <p className="mt-5 max-w-xl text-sm text-red-300" role="alert">
              {notice.text}
            </p>
          )}
          {connection === "connecting" && <p className="mt-3 text-sm text-muted">Connecting to the study server…</p>}
          {notice && (
            <button className="button button-ghost mt-5" onClick={retryQueue}>
              Retry connection
            </button>
          )}
          <div className="mt-8 flex items-center gap-2 font-mono text-sm text-gold">
            <Clock3 size={16} /> max wait {Math.floor(queueSeconds / 60)}:{String(queueSeconds % 60).padStart(2, "0")}
          </div>
          <button className="button button-ghost mt-8" onClick={leaveQueue}>
            <X size={15} /> leave queue
          </button>
        </section>
      </Shell>
    );

  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
        <section className="grid items-end gap-10 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="eyebrow">foundation exam study arena</div>
            <h1 className="mt-5 max-w-3xl font-mono text-5xl font-bold leading-[.95] tracking-[-.075em] sm:text-7xl">
              FE Arena study room
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-muted">
              Practice core computer science foundations with solo drills, private 1v1s, and public study rooms.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button
                className="button button-primary"
                onClick={joinQueue}
                aria-describedby={!validName ? "public-queue-validation" : undefined}
              >
                <Radio size={16} /> public queue <ArrowRight size={16} />
              </button>
              <Link to="/solo" className="button button-ghost">
                <BookOpen size={16} /> solo practice
              </Link>
              <Link to="/practice/c" className="button button-ghost">
                <Code2 size={16} /> C practice lab
              </Link>
            </div>
            {!validName && (
              <p id="public-queue-validation" className="mt-3 text-sm text-muted" role="status">
                Enter a guest name below before joining the public queue.
              </p>
            )}
            {notice && (
              <p className={`mt-3 text-sm ${notice.kind === "error" ? "text-red-300" : "text-gold"}`} role="status">
                {notice.text}
              </p>
            )}
          </div>
          <div className="gold-grid rounded-2xl border border-gold/20 bg-panel/80 p-6 sm:p-8">
            <p className="eyebrow text-gold">built for careful practice</p>
            <div className="mt-7 space-y-5">
              <Feature
                icon={<ShieldCheck size={18} />}
                title="server-graded"
                text="One locked submission. Correctness is worth 1,000 points."
              />
              <Feature
                icon={<Clock3 size={18} />}
                title="speed is secondary"
                text="Earn up to 300 bonus points without letting the clock decide everything."
              />
              <Feature
                icon={<Users size={18} />}
                title="two seats, stable guests"
                text="Refresh recovery and a clear 30-second disconnect pause."
              />
            </div>
          </div>
        </section>
        <section className="mt-20 grid gap-5 lg:grid-cols-2">
          <article className="panel p-6 sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">private 1v1</p>
                <h2 className="display mt-2 text-3xl">set the room</h2>
              </div>
              <LockKeyhole className="text-gold" size={22} />
            </div>
            <label className="field-label mt-7" htmlFor="name">
              guest name
            </label>
            <input
              id="name"
              className="field mt-2"
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. pointerPilot"
            />
            {notice && (
              <p className={`mt-3 text-sm ${notice.kind === "error" ? "text-red-300" : "text-muted"}`} role="alert">
                {notice.text}
              </p>
            )}
            {privateRequestState === "timed-out" && (
              <button className="button button-ghost mt-4 w-full" onClick={retryPrivateCreate}>
                Retry room creation
              </button>
            )}
            <div className="mt-7 flex items-center justify-between">
              <div>
                <p id="private-timer-label" className="field-label">
                  question timer
                </p>
                <p className="mt-1 text-sm text-muted">{timer} seconds · five rounds</p>
              </div>
              <Select
                value={String(timer)}
                options={TIMER_OPTIONS}
                onChange={(value) => setTimer(Number(value))}
                containerClassName="w-auto"
                buttonClassName="w-auto"
                ariaLabelledBy="private-timer-label"
              />
            </div>
            <button
              className="button button-primary mt-6 w-full"
              disabled={busy || topics.length === 0}
              onClick={createPrivate}
            >
              <LockKeyhole size={16} /> {busy ? "creating private room…" : "create private room"}
            </button>
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-muted underline-offset-4 hover:text-gold hover:underline"
              onClick={() => setView("private")}
            >
              <Menu size={15} /> configure topic pool ({topics.length}/12)
            </button>
          </article>
          <article className="panel p-6 sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">join a friend</p>
                <h2 className="display mt-2 text-3xl">enter a code</h2>
              </div>
              <Hash className="text-gold" size={22} />
            </div>
            <form onSubmit={joinPrivate}>
              <label className="field-label mt-7" htmlFor="code">
                six-character room code
              </label>
              <input
                id="code"
                className="field mt-2 text-center font-mono uppercase tracking-[.25em]"
                maxLength={6}
                value={roomCode}
                onChange={(event) => setRoomCode(normalizeCode(event.target.value))}
                placeholder="ABC123"
              />{" "}
              <button className="button button-ghost mt-6 w-full">
                <ArrowRight size={16} /> join private room
              </button>
            </form>
            <div className="mt-10 border-t border-line pt-5 text-sm text-muted">
              <button className="flex items-center gap-2 hover:text-gold" onClick={() => setView("private")}>
                <Menu size={15} /> review topics and room settings
              </button>
            </div>
          </article>
        </section>
        <section className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
          <span>12 topic families · original prompts · seven answer types</span>
          <span>Not affiliated with or endorsed by UCF.</span>
        </section>
        {view === "private" && (
          <TopicDialog
            topics={topics}
            toggleTopic={toggleTopic}
            timer={timer}
            setTimer={setTimer}
            close={closeTopicDialog}
          />
        )}
      </main>
    </Shell>
  );
}

const TIMER_OPTIONS = [
  { value: "60", label: "60 sec" },
  { value: "90", label: "90 sec" },
  { value: "120", label: "120 sec" },
  { value: "300", label: "5 min" },
];

const Feature = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <div className="flex gap-3">
    <span className="mt-0.5 text-gold">{icon}</span>
    <div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
    </div>
  </div>
);
const TopicDialog = ({
  topics,
  toggleTopic,
  timer,
  setTimer,
  close,
}: {
  topics: TopicId[];
  toggleTopic: (id: TopicId) => void;
  timer: number;
  setTimer: (timer: number) => void;
  close: () => void;
}) => {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [close]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topic-dialog-title"
      aria-describedby="topic-dialog-description"
    >
      <section ref={dialogRef} className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow text-gold">host controls</p>
            <h2 id="topic-dialog-title" className="display mt-2 text-3xl">
              choose your syllabus
            </h2>
            <p id="topic-dialog-description" className="mt-3 text-sm text-muted">
              Guests see the selected pool. Public queue always uses all reviewed topics.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="Close topic settings"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-7 flex items-center justify-between gap-4 border-y border-line py-4">
          <div>
            <p id="topic-dialog-timer-label" className="field-label">
              question timer
            </p>
            <p className="mt-1 text-sm text-muted">{timer} seconds · five rounds</p>
          </div>
          <Select
            value={String(timer)}
            options={TIMER_OPTIONS}
            onChange={(value) => setTimer(Number(value))}
            containerClassName="w-auto"
            buttonClassName="w-auto"
            ariaLabelledBy="topic-dialog-timer-label"
          />
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          {TOPICS.map((topic) => {
            const selected = topics.includes(topic.id);
            return (
              <button
                key={topic.id}
                type="button"
                className={`topic-chip ${selected ? "topic-chip-active" : ""}`}
                aria-pressed={selected}
                onClick={() => toggleTopic(topic.id)}
              >
                <span>{topic.label}</span>
                {selected && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <button type="button" className="button button-primary mt-7 w-full" onClick={close}>
          <Check size={16} /> save topic pool
        </button>
      </section>
    </div>
  );
};
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-ink text-cream">
    <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-line px-5 py-5 sm:px-8">
      <Link to="/" className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded bg-gold font-black text-ink">FE</span>
        <span className="font-mono text-sm font-bold tracking-[.18em]">ARENA</span>
      </Link>
      <div className="flex items-center gap-5">
        <AuthPanel />
        <AppSettings />
        <span className="hidden text-xs text-muted sm:inline">v1 study room</span>
      </div>
    </header>
    {children}
  </div>
);
