import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Check, Clock3, Hash, LockKeyhole, Menu, Radio, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import AuthPanel from "@/components/AuthPanel";
import { AppSettings } from "@/components/AppSettings";
import { connectSocket, socket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";
import { TOPICS, type MatchConfig, type TopicId } from "../../../shared/domain";

const DEFAULT_TOPICS: TopicId[] = ["arrays-memory", "linked-lists", "stacks", "queues", "binary-trees", "sorting", "recursion", "analysis-mathematics"];
const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

type Notice = { kind: "error" | "info"; text: string } | null;
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
  const queuedName = useRef<string | null>(null);
  const validName = name.trim().length > 0;
  const config: MatchConfig = useMemo(() => ({ topicIds: topics, roundCount: 5, questionTimerSeconds: timer }), [timer, topics]);

  useEffect(() => {
    const created = (payload: { roomId: string; seatId: string; reconnectToken: string }) => {
      useGameStore.getState().setSession(payload.seatId, payload.reconnectToken, payload.roomId);
      setBusy(false); navigate(`/room/${payload.roomId}`);
    };
    const queueSeat = (payload: { roomId: string; seatId: string; reconnectToken: string }) => {
      queuedName.current = null;
      useGameStore.getState().setSession(payload.seatId, payload.reconnectToken, payload.roomId);
      navigate(`/room/${payload.roomId}`);
    };
    const waiting = (payload: { status: string; expiresAt?: number }) => { if (payload.status === "waiting") { setView("queue"); setQueueExpiresAt(payload.expiresAt ?? Date.now() + 300_000); } else { queuedName.current = null; setView("home"); setQueueExpiresAt(null); } };
    const onConnect = () => { if (queuedName.current) socket.emit("queue:join", { username: queuedName.current }); };
    const failed = (payload: { message?: string } | string) => { setBusy(false); setNotice({ kind: "error", text: typeof payload === "string" ? payload : payload.message ?? "Request failed." }); };
    socket.on("room:created", created); socket.on("queue:seat", queueSeat); socket.on("queue:state", waiting); socket.on("connect", onConnect); socket.on("server:error", failed);
    return () => { socket.off("room:created", created); socket.off("queue:seat", queueSeat); socket.off("queue:state", waiting); socket.off("connect", onConnect); socket.off("server:error", failed); };
  }, [navigate]);
  useEffect(() => { if (view !== "queue") return; const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id); }, [view]);

  const begin = () => { if (!validName) { setNotice({ kind: "error", text: "Choose a guest name first." }); return false; } setPlayerName(name); setNotice(null); connectSocket(); return true; };
  const createPrivate = () => { if (!begin()) return; setBusy(true); socket.emit("room:create-private", { username: name.trim(), config }); };
  const joinPrivate = (event: React.FormEvent) => { event.preventDefault(); if (!begin() || roomCode.length !== 6) { if (roomCode.length !== 6) setNotice({ kind: "error", text: "Enter a six-character room code." }); return; } navigate(`/room/${roomCode}`); };
  const joinQueue = () => { if (!begin()) return; queuedName.current = name.trim(); if (socket.connected) socket.emit("queue:join", { username: queuedName.current }); setView("queue"); };
  const leaveQueue = () => { queuedName.current = null; socket.emit("queue:leave"); setView("home"); setQueueExpiresAt(null); };
  const toggleTopic = (id: TopicId) => setTopics((current) => current.includes(id) ? current.filter((topic) => topic !== id) : [...current, id]);
  const queueSeconds = queueExpiresAt ? Math.max(0, Math.ceil((queueExpiresAt - now) / 1000)) : 300;

  if (view === "queue") return <Shell><section className="mx-auto flex max-w-xl flex-col items-center py-24 text-center"><div className="relative grid size-20 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold"><Radio className="animate-pulse" size={28} /></div><p className="eyebrow mt-8">public study queue</p><h1 className="display mt-3 text-4xl">finding a study partner</h1><p className="mt-4 max-w-md text-muted">The public room uses the full reviewed bank, five rounds, and a five-minute question timer.</p><div className="mt-8 flex items-center gap-2 font-mono text-sm text-gold"><Clock3 size={16} /> max wait {Math.floor(queueSeconds / 60)}:{String(queueSeconds % 60).padStart(2, "0")}</div><button className="button button-ghost mt-8" onClick={leaveQueue}><X size={15} /> leave queue</button></section></Shell>;

  return <Shell><main className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20"><section className="grid items-end gap-10 lg:grid-cols-[1.2fr_.8fr]"><div><div className="eyebrow flex items-center gap-2"><Sparkles size={14} className="text-gold" /> foundation exam study arena</div><h1 className="display mt-5 max-w-3xl text-5xl leading-[.92] sm:text-8xl">think clearly.<br /><span className="text-gold">answer faster.</span></h1><p className="mt-7 max-w-xl text-lg leading-8 text-muted">A focused, unofficial practice room for core computer science foundations. Solo drills, private 1v1s, and a public study queue.</p><div className="mt-9 flex flex-wrap gap-3"><button className="button button-primary" onClick={joinQueue}><Radio size={16} /> public queue <ArrowRight size={16} /></button><Link to="/solo" className="button button-ghost"><BookOpen size={16} /> solo practice</Link></div></div><div className="gold-grid rounded-2xl border border-gold/20 bg-panel/80 p-6 sm:p-8"><p className="eyebrow text-gold">built for careful practice</p><div className="mt-7 space-y-5"><Feature icon={<ShieldCheck size={18} />} title="server-graded" text="One locked submission. Correctness is worth 1,000 points." /><Feature icon={<Clock3 size={18} />} title="speed is secondary" text="Earn up to 300 bonus points without letting the clock decide everything." /><Feature icon={<Users size={18} />} title="two seats, stable guests" text="Refresh recovery and a clear 30-second disconnect pause." /></div></div></section>
    <section className="mt-20 grid gap-5 lg:grid-cols-2"><article className="panel p-6 sm:p-8"><div className="flex items-start justify-between"><div><p className="eyebrow">private 1v1</p><h2 className="display mt-2 text-3xl">set the room</h2></div><LockKeyhole className="text-gold" size={22} /></div><label className="field-label mt-7" htmlFor="name">guest name</label><input id="name" className="field mt-2" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. pointerPilot" />{notice && <p className={`mt-3 text-sm ${notice.kind === "error" ? "text-red-300" : "text-muted"}`} role="alert">{notice.text}</p>}<div className="mt-7 flex items-center justify-between"><div><p className="field-label">question timer</p><p className="mt-1 text-sm text-muted">{timer} seconds · five rounds</p></div><select className="field w-auto" value={timer} onChange={(event) => setTimer(Number(event.target.value))}><option value={60}>60 sec</option><option value={90}>90 sec</option><option value={120}>120 sec</option><option value={300}>5 min</option></select></div><button className="button button-primary mt-6 w-full" disabled={busy || topics.length === 0} onClick={createPrivate}><LockKeyhole size={16} /> create private room</button><button className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-muted underline-offset-4 hover:text-gold hover:underline" onClick={() => setView("private")}><Menu size={15} /> configure topic pool ({topics.length}/12)</button></article>
      <article className="panel p-6 sm:p-8"><div className="flex items-start justify-between"><div><p className="eyebrow">join a friend</p><h2 className="display mt-2 text-3xl">enter a code</h2></div><Hash className="text-gold" size={22} /></div><form onSubmit={joinPrivate}><label className="field-label mt-7" htmlFor="code">six-character room code</label><input id="code" className="field mt-2 text-center font-mono uppercase tracking-[.25em]" maxLength={6} value={roomCode} onChange={(event) => setRoomCode(normalizeCode(event.target.value))} placeholder="ABC123" /> <button className="button button-ghost mt-6 w-full"><ArrowRight size={16} /> join private room</button></form><div className="mt-10 border-t border-line pt-5 text-sm text-muted"><button className="flex items-center gap-2 hover:text-gold" onClick={() => setView("private")}><Menu size={15} /> review topics and room settings</button></div></article></section>
    <section className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted"><span>12 topic families · original prompts · six answer types</span><span>Not affiliated with or endorsed by UCF.</span></section>
    {view === "private" && <TopicDialog topics={topics} toggleTopic={toggleTopic} close={() => setView("home")} />}
  </main></Shell>;
}

const Feature = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => <div className="flex gap-3"><span className="mt-0.5 text-gold">{icon}</span><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted">{text}</p></div></div>;
const TopicDialog = ({ topics, toggleTopic, close }: { topics: TopicId[]; toggleTopic: (id: TopicId) => void; close: () => void }) => <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5" role="dialog" aria-modal="true"><section className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8"><div className="flex items-start justify-between"><div><p className="eyebrow text-gold">host controls</p><h2 className="display mt-2 text-3xl">choose your syllabus</h2><p className="mt-3 text-sm text-muted">Guests see the selected pool. Public queue always uses all reviewed topics.</p></div><button className="icon-button" onClick={close} aria-label="Close"><X size={17} /></button></div><div className="mt-7 grid gap-2 sm:grid-cols-2">{TOPICS.map((topic) => <button key={topic.id} className={`topic-chip ${topics.includes(topic.id) ? "topic-chip-active" : ""}`} onClick={() => toggleTopic(topic.id)}><span>{topic.label}</span>{topics.includes(topic.id) && <Check size={15} />}</button>)}</div><button className="button button-primary mt-7 w-full" onClick={close}><Check size={16} /> save topic pool</button></section></div>;
const Shell = ({ children }: { children: React.ReactNode }) => <div className="min-h-screen bg-ink text-cream"><header className="mx-auto flex max-w-7xl items-center justify-between border-b border-line px-5 py-5 sm:px-8"><Link to="/" className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded bg-gold font-black text-ink">FE</span><span className="font-mono text-sm font-bold tracking-[.18em]">ARENA</span></Link><div className="flex items-center gap-5"><AuthPanel /><AppSettings /><span className="hidden text-xs text-muted sm:inline">v1 study room</span></div></header>{children}</div>;
