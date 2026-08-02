import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3, CalendarDays, Trophy } from "lucide-react";
import AuthPanel from "@/components/AuthPanel";
import { useAuth } from "@/context/useAuth";
import { TOPICS, type TopicId, type TopicPerformance } from "../../../shared/domain";

type AccountMatch = { matchId: string; source: "private" | "public"; terminalOutcome: string; result: string; playerName: string; opponentName: string | null; playerScore: number; opponentScore: number | null; playerCorrect: number; opponentCorrect: number | null; startedAt: string; finishedAt: string; topicIds: TopicId[] };
type AccountHistory = { matches: AccountMatch[]; progress: Record<TopicId, TopicPerformance> };
const apiUrl = (path: string) => `${(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001").replace(/\/$/, "")}${path}`;

export default function Account() {
  const { loading, user, accessToken, error: authError } = useAuth();
  const [history, setHistory] = useState<AccountHistory | null>(null);
  const [error, setError] = useState("");
  const fetching = Boolean(!loading && user && accessToken && !history && !error);
  useEffect(() => {
    if (loading || !user || !accessToken) return;
    let active = true;
    void fetch(apiUrl("/api/account/history"), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => { if (!response.ok) throw new Error(response.status === 401 ? "Your account session expired. Sign in again." : "History could not be loaded."); return response.json() as Promise<AccountHistory>; })
      .then((value) => { if (active) setHistory(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "History could not be loaded."); })
      .finally(() => undefined);
    return () => { active = false; };
  }, [accessToken, loading, user]);

  return <div className="min-h-screen bg-ink text-cream"><header className="mx-auto flex max-w-7xl items-center justify-between border-b border-line px-5 py-5 sm:px-8"><Link to="/" className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded bg-gold font-black text-ink">FE</span><span className="font-mono text-sm font-bold tracking-[.18em]">ARENA</span></Link><AuthPanel /></header><main className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-gold"><ArrowLeft size={15} /> back to guest play</Link>{loading ? <State title="checking account" text="Restoring your optional account session…" /> : !user && authError ? <State title="authentication error" text={authError} error /> : !user ? <State title="history is private" text="Sign in to see your match summaries and topic progress. Guest runs stay on this device only." /> : fetching ? <State title="loading your history" text="Only your server-authorized summaries are requested." /> : error ? <State title="history unavailable" text={error} error /> : <><div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-gold">private account view</p><h1 className="display mt-2 text-5xl">history & progress</h1><p className="mt-3 text-muted">Compact terminal summaries only. No answers, prompts, or chat are saved.</p></div><div className="flex items-center gap-2 text-sm text-muted"><Trophy size={16} className="text-gold" /> {history?.matches.length ?? 0} saved matches</div></div><section className="mt-10 grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><article className="panel p-6 sm:p-8"><div className="flex items-center gap-2"><BarChart3 size={18} className="text-gold" /><p className="eyebrow">topic progress</p></div><div className="mt-6 space-y-4">{TOPICS.map((topic) => { const value = history?.progress[topic.id]; return <div key={topic.id}><div className="flex justify-between gap-3 text-sm"><span>{topic.label}</span><span className="font-mono text-muted">{value?.attempted ?? 0} attempts · {Math.round((value?.accuracy ?? 0) * 100)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (value?.accuracy ?? 0) * 100)}%` }} /></div></div>; })}</div></article><article className="panel p-6 sm:p-8"><p className="eyebrow">terminal matches</p><div className="mt-5 space-y-3">{history?.matches.length ? history.matches.map((match) => <div key={match.matchId} className="rounded-lg border border-line bg-ink/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`font-semibold ${match.result === "win" ? "text-gold" : match.result === "loss" ? "text-red-200" : "text-cream"}`}>{match.result}</span><span className="text-xs text-muted">{match.source} · {match.terminalOutcome}</span></div><span className="flex items-center gap-1 text-xs text-muted"><CalendarDays size={13} /> {new Date(match.finishedAt).toLocaleDateString()}</span></div><p className="mt-2 text-sm">{match.playerName} {match.opponentName ? `vs ${match.opponentName}` : ""} · {match.playerScore}–{match.opponentScore ?? "—"}</p><p className="mt-2 text-xs text-muted">{match.topicIds.map((topicId) => TOPICS.find((topic) => topic.id === topicId)?.label ?? topicId).join(" · ")}</p></div>) : <p className="text-sm text-muted">No terminal matches are linked to this account yet. Play as a guest or sign in before your next match.</p>}</div></article></section></>}</main></div>;
}

const State = ({ title, text, error = false }: { title: string; text: string; error?: boolean }) => <section className="mx-auto mt-24 max-w-xl text-center"><p className={`eyebrow ${error ? "text-red-300" : "text-gold"}`}>{title}</p><p className="mt-4 leading-7 text-muted" role={error ? "alert" : undefined}>{text}</p></section>;
