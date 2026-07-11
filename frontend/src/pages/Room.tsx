import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import YouTube, { type YouTubeEvent } from "react-youtube";
import Fuse from "fuse.js";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  Home,
  MessageCircle,
  RotateCcw,
  Send,
  SkipForward,
  Trophy,
  UserRound,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { AppSettings } from "@/components/AppSettings";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/hooks/useSocket";
import { playSound } from "@/lib/sound";
import { useGameStateStore, useGameStore } from "@/store/gameStore";
import type { AnswerOption, RoundResult } from "@/types";

const normalizeRoomCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

const activePhases = new Set(["COUNTDOWN", "PLAYING", "GRACE_PERIOD", "REVEAL"]);

const Room = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const roomCode = normalizeRoomCode(id ?? "");
  const playerName = useGameStore((state) => state.playerName);
  const volume = useGameStore((state) => state.volume);
  const musicMuted = useGameStore((state) => state.musicMuted);
  const phase = useGameStateStore((state) => state.phase);
  const currentRound = useGameStateStore((state) => state.currentRound);
  const health = useGameStateStore((state) => state.health);
  const pendingDamage = useGameStateStore((state) => state.pendingDamage);
  const currentVideoId = useGameStateStore((state) => state.currentVideoID);
  const currentVideoDurationSeconds = useGameStateStore((state) => state.currentVideoDurationSeconds);
  const videoStartTime = useGameStateStore((state) => state.videoStartTime);
  const roundStartTime = useGameStateStore((state) => state.roundStartTime);
  const countdownEndsAt = useGameStateStore((state) => state.countdownEndsAt);
  const roundEndsAt = useGameStateStore((state) => state.roundEndsAt);
  const ready = useGameStateStore((state) => state.ready);
  const winner = useGameStateStore((state) => state.winner);
  const revealedAnswer = useGameStateStore((state) => state.revealedAnswer);
  const roundResult = useGameStateStore((state) => state.roundResult);
  const matchHistory = useGameStateStore((state) => state.matchHistory);
  const guessedCorrectly = useGameStateStore((state) => state.guessedCorrectly);
  const skipVotes = useGameStateStore((state) => state.skipVotes);
  const answerOptions = useGameStateStore((state) => state.answerOptions);
  const connectionPause = useGameStateStore((state) => state.connectionPause);

  const {
    players,
    messages,
    errorNotice,
    guessCooldownEndsAt,
    connectionState,
    sendChatMessage,
    setReady,
    voteToSkip,
    leaveRoom,
  } = useSocket(roomCode, playerName);

  const [now, setNow] = useState(() => Date.now());
  const [inputValue, setInputValue] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityInput, setActivityInput] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const playerRef = useRef<YouTubeEvent["target"] | null>(null);
  const previousPhase = useRef(phase);
  const previousCountdown = useRef<number | null>(null);
  const previousCorrectCount = useRef(guessedCorrectly.length);
  const previousMessageCount = useRef(messages.length);
  const [unreadCount, setUnreadCount] = useState(0);

  const opponentName = players.find((name) => name !== playerName) ?? null;
  const selfReady = Boolean(ready[playerName]);
  const opponentReady = opponentName ? Boolean(ready[opponentName]) : false;
  const hasTimer = countdownEndsAt !== null || roundEndsAt !== null || guessCooldownEndsAt > now || connectionPause?.expiresAt;
  const countdownSeconds = countdownEndsAt ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000)) : null;
  const roundSeconds = roundEndsAt ? Math.max(0, Math.ceil((roundEndsAt - now) / 1000)) : null;
  const reconnectSeconds = connectionPause?.expiresAt ? Math.max(0, Math.ceil((connectionPause.expiresAt - now) / 1000)) : null;
  const playerVolume = musicMuted || volume === 0 ? 0 : Math.max(1, Math.round((volume / 100) ** 2 * 100));
  const alreadyCorrect = guessedCorrectly.includes(playerName);
  const alreadySkipped = skipVotes.includes(playerName);
  const canGuess = (phase === "PLAYING" || phase === "GRACE_PERIOD") && !alreadyCorrect && !connectionPause;

  const fuse = useMemo(
    () => new Fuse(answerOptions, {
      keys: [{ name: "canonicalTitle", weight: 0.65 }, { name: "searchTerms", weight: 0.35 }],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    [answerOptions],
  );
  const suggestions = useMemo(() => {
    if (!canGuess || inputValue.trim().length < 2) return [];
    return fuse.search(inputValue.trim()).slice(0, 5).map((result) => result.item);
  }, [canGuess, fuse, inputValue]);
  const selectedSuggestion = suggestions[Math.min(suggestionIndex, suggestions.length - 1)];

  useEffect(() => {
    if (!roomCode || !playerName) {
      navigate("/", { replace: true });
      return;
    }
    if (id !== roomCode) navigate(`/room/${roomCode}`, { replace: true });
  }, [id, navigate, playerName, roomCode]);

  useEffect(() => {
    if (!hasTimer) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [hasTimer]);

  useEffect(() => {
    playerRef.current?.setVolume(playerVolume);
  }, [playerVolume]);

  useEffect(() => {
    if (connectionPause) {
      playerRef.current?.pauseVideo();
      return;
    }
    if ((phase === "PLAYING" || phase === "GRACE_PERIOD") && roundStartTime && playerRef.current) {
      const elapsed = Math.max(0, (Date.now() - roundStartTime) / 1000);
      const rawTime = videoStartTime + elapsed;
      const syncTime = currentVideoDurationSeconds ? rawTime % currentVideoDurationSeconds : rawTime;
      playerRef.current.seekTo(syncTime, true);
      playerRef.current.playVideo();
    }
  }, [connectionPause, currentVideoDurationSeconds, phase, roundStartTime, videoStartTime]);

  useEffect(() => {
    if (messages.length > previousMessageCount.current && !activityOpen) {
      setUnreadCount((count) => count + messages.length - previousMessageCount.current);
    }
    previousMessageCount.current = messages.length;
  }, [activityOpen, messages.length]);

  useEffect(() => {
    if (previousPhase.current === phase) return;
    if (phase === "COUNTDOWN") playSound("countdown");
    if (phase === "PLAYING") playSound("round-start");
    if (phase === "REVEAL") playSound("reveal");
    if (phase === "GAME_OVER") playSound(winner === playerName ? "victory" : "defeat");
    previousPhase.current = phase;
  }, [phase, playerName, winner]);

  useEffect(() => {
    if (phase === "COUNTDOWN" && countdownSeconds !== null && previousCountdown.current !== countdownSeconds) {
      playSound("countdown");
    }
    previousCountdown.current = countdownSeconds;
  }, [countdownSeconds, phase]);

  useEffect(() => {
    if (guessedCorrectly.length > previousCorrectCount.current) playSound("correct");
    previousCorrectCount.current = guessedCorrectly.length;
  }, [guessedCorrectly.length]);

  useEffect(() => {
    if (!roundResult?.damageDealt) return;
    playSound("damage");
  }, [roundResult]);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    event.target.setVolume(playerVolume);
    if (!roundStartTime) return;
    const elapsed = Math.max(0, (Date.now() - roundStartTime) / 1000);
    const rawTime = videoStartTime + elapsed;
    const syncTime = currentVideoDurationSeconds ? rawTime % currentVideoDurationSeconds : rawTime;
    event.target.seekTo(syncTime, true);
    if (!connectionPause) event.target.playVideo();
  };

  const submitInput = (value: string) => {
    const message = value.trim();
    if (!message) return;
    const enforceCooldown = phase === "PLAYING" || phase === "GRACE_PERIOD";
    if (sendChatMessage(message, enforceCooldown)) {
      setInputValue("");
      playSound("confirm");
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    submitInput(selectedSuggestion?.canonicalTitle ?? inputValue);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopyMessage("copied");
      playSound("copy");
    } catch {
      setCopyMessage("copy failed");
    }
    window.setTimeout(() => setCopyMessage(""), 1800);
  };

  const requestLeave = () => {
    if (activePhases.has(phase) && phase !== "GAME_OVER") setLeaveOpen(true);
    else exitRoom();
  };

  const toggleActivity = () => {
    if (!activityOpen) setUnreadCount(0);
    setActivityOpen(!activityOpen);
  };

  const exitRoom = () => {
    leaveRoom();
    playSound("navigate");
    navigate("/");
  };

  if (!roomCode || !playerName) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="relative z-40 border-b border-border bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={requestLeave} className="interactive flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground" aria-label="Go home">
            <Home size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="ui-label">anime room</p>
            <p className="ui-title truncate text-sm">{phaseLabel(phase)}</p>
          </div>
          <button type="button" onClick={copyCode} className="interactive hidden items-center gap-3 rounded-md border border-border bg-card px-3 py-2 sm:flex">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">{roomCode}</span>
            <Clipboard className="text-muted-foreground" size={14} />
            <span className="sr-only" aria-live="polite">{copyMessage}</span>
          </button>
          <button type="button" onClick={toggleActivity} className="interactive relative flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground" aria-label="Toggle activity">
            <MessageCircle size={17} />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] text-primary-foreground">{Math.min(9, unreadCount)}</span>}
          </button>
          <AppSettings />
        </div>
      </header>

      {connectionState !== "connected" && !connectionPause && (
        <div role="status" className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 font-mono text-xs lowercase text-warning">
          <WifiOff size={14} /> reconnecting to the server…
        </div>
      )}

      <div className="relative mx-auto flex w-full max-w-7xl flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {phase === "LOBBY" ? (
            <Lobby
              roomCode={roomCode}
              playerName={playerName}
              opponentName={opponentName}
              selfReady={selfReady}
              opponentReady={opponentReady}
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSubmit={submit}
              onReady={() => { playSound("confirm"); setReady(); }}
              onCopy={copyCode}
              copyMessage={copyMessage}
            />
          ) : phase === "COUNTDOWN" ? (
            <Countdown seconds={countdownSeconds ?? 3} />
          ) : phase === "REVEAL" ? (
            <RoundReveal result={roundResult} revealedAnswer={revealedAnswer} playerName={playerName} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} />
          ) : phase === "GAME_OVER" ? (
            <GameOver
              winner={winner}
              playerName={playerName}
              health={health}
              players={Object.keys(health)}
              history={matchHistory}
              historyOpen={historyOpen}
              setHistoryOpen={setHistoryOpen}
              onHome={exitRoom}
              onRematch={() => { playSound("confirm"); setReady(); }}
            />
          ) : (
            <GameStage
              currentRound={currentRound}
              roundSeconds={roundSeconds}
              playerName={playerName}
              opponentName={opponentName}
              health={health}
              pendingDamage={pendingDamage}
              guessedCorrectly={guessedCorrectly}
              inputValue={inputValue}
              setInputValue={(value) => { setInputValue(value); setSuggestionIndex(0); }}
              submit={submit}
              suggestions={suggestions}
              selectedIndex={suggestionIndex}
              setSelectedIndex={setSuggestionIndex}
              submitSuggestion={(suggestion) => submitInput(suggestion.canonicalTitle)}
              disabled={!canGuess || guessCooldownEndsAt > now}
              cooldown={Math.max(0, (guessCooldownEndsAt - now) / 1000)}
              canSkip={phase === "PLAYING" && players.length === 2}
              skipVotes={skipVotes.length}
              alreadySkipped={alreadySkipped}
              onSkip={() => { playSound("select"); voteToSkip(); }}
              error={errorNotice}
            />
          )}
        </main>

        <ActivityPanel
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
          messages={messages}
          playerName={playerName}
          value={activityInput}
          onChange={setActivityInput}
          onSend={() => {
            if (sendChatMessage(activityInput)) {
              setActivityInput("");
              playSound("confirm");
            }
          }}
        />
      </div>

      <div className="pointer-events-none absolute size-px overflow-hidden opacity-0">
        {(phase === "PLAYING" || phase === "GRACE_PERIOD") && currentVideoId && (
          <YouTube videoId={currentVideoId} opts={{ width: "1", height: "1", playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0 } }} onReady={onPlayerReady} onEnd={(event) => { event.target.seekTo(0, true); event.target.playVideo(); }} />
        )}
      </div>

      {connectionPause && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/90 p-5">
          <section className="surface-raised event-enter max-w-md p-7 text-center">
            <WifiOff className="mx-auto text-warning" size={28} />
            <p className="ui-label mt-5">match paused</p>
            <h2 className="ui-title mt-2 text-2xl">waiting for {connectionPause.playerName}</h2>
            <p className="mt-4 leading-6 text-muted-foreground">Music and timers are paused for both players. The match will resume automatically if they reconnect.</p>
            <p className="mt-6 font-mono text-lg text-warning">{reconnectSeconds ?? 0}s</p>
          </section>
        </div>
      )}

      {leaveOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-5" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <section className="surface-raised max-w-sm p-6">
            <p className="ui-label">leave active match</p>
            <h2 id="leave-title" className="ui-title mt-2 text-2xl">forfeit and go home?</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Your opponent will win this match. This cannot be undone.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setLeaveOpen(false)} className="rounded-md font-mono text-xs lowercase">stay</Button>
              <Button onClick={exitRoom} className="rounded-md bg-destructive font-mono text-xs lowercase text-background">leave match</Button>
            </div>
          </section>
        </div>
      )}
      <Toast message={copyMessage === "copied" ? "Room code copied." : ""} onDismiss={() => setCopyMessage("")} />
    </div>
  );
};

const Lobby = ({ roomCode, playerName, opponentName, selfReady, opponentReady, inputValue, setInputValue, onSubmit, onReady, onCopy, copyMessage }: {
  roomCode: string; playerName: string; opponentName: string | null; selfReady: boolean; opponentReady: boolean; inputValue: string; setInputValue: (value: string) => void; onSubmit: (event: React.FormEvent) => void; onReady: () => void; onCopy: () => void; copyMessage: string;
}) => (
  <section className="page-enter mx-auto flex min-h-[calc(100vh-8rem)] max-w-4xl flex-col justify-center">
    <div className="text-center">
      <p className="ui-label">private lobby</p>
      <h1 className="ui-title mt-2 text-3xl sm:text-5xl">ready when you are</h1>
      <button type="button" onClick={onCopy} className="interactive mx-auto mt-5 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs uppercase tracking-[0.2em]">
        {roomCode}<Clipboard size={14} /><span className="normal-case tracking-normal text-muted-foreground">{copyMessage}</span>
      </button>
    </div>
    <div className="mt-10 grid gap-4 sm:grid-cols-2">
      <PlayerCard name={playerName} label="you" ready={selfReady} />
      <PlayerCard name={opponentName ?? "waiting for a player"} label="opponent" ready={opponentReady} empty={!opponentName} />
    </div>
    <div className="mx-auto mt-8 w-full max-w-lg">
      <Button type="button" disabled={!opponentName} onClick={onReady} className={`h-12 w-full rounded-md font-mono text-sm lowercase ${selfReady ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground"}`}>
        <Check size={16} /> {selfReady ? "unready" : "ready up"}
      </Button>
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder="send a lobby message" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-input px-3 text-sm outline-none focus:border-primary" />
        <Button size="icon" variant="outline" className="size-10 rounded-md" aria-label="Send message"><Send size={15} /></Button>
      </form>
    </div>
  </section>
);

const PlayerCard = ({ name, label, ready, empty = false }: { name: string; label: string; ready: boolean; empty?: boolean }) => (
  <article className={`surface p-6 ${empty ? "border-dashed" : ""}`}>
    <div className="flex items-start justify-between gap-4">
      <span className="flex size-11 items-center justify-center rounded-md border border-border bg-input text-muted-foreground"><UserRound size={20} /></span>
      <span className={`rounded-full border px-2 py-1 font-mono text-[10px] lowercase ${ready ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground"}`}>{ready ? "ready" : empty ? "open seat" : "not ready"}</span>
    </div>
    <p className="ui-label mt-8">{label}</p>
    <h2 className={`mt-1 truncate text-xl font-semibold ${empty ? "text-muted-foreground" : ""}`}>{name}</h2>
  </article>
);

const Countdown = ({ seconds }: { seconds: number }) => (
  <section className="page-enter flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center text-center">
    <p className="ui-label">get ready</p>
    <p key={seconds} className="event-enter ui-title mt-4 text-8xl text-primary sm:text-9xl">{seconds}</p>
    <p className="mt-5 text-muted-foreground">The first track is about to begin.</p>
  </section>
);

const GameStage = ({ currentRound, roundSeconds, playerName, opponentName, health, pendingDamage, guessedCorrectly, inputValue, setInputValue, submit, suggestions, selectedIndex, setSelectedIndex, submitSuggestion, disabled, cooldown, canSkip, skipVotes, alreadySkipped, onSkip, error }: {
  currentRound: number; roundSeconds: number | null; playerName: string; opponentName: string | null; health: Record<string, number>; pendingDamage: Record<string, number>; guessedCorrectly: string[]; inputValue: string; setInputValue: (value: string) => void; submit: (event: React.FormEvent) => void; suggestions: AnswerOption[]; selectedIndex: number; setSelectedIndex: React.Dispatch<React.SetStateAction<number>>; submitSuggestion: (suggestion: AnswerOption) => void; disabled: boolean; cooldown: number; canSkip: boolean; skipVotes: number; alreadySkipped: boolean; onSkip: () => void; error: string;
}) => (
  <section className="page-enter mx-auto max-w-5xl">
    <div className="grid gap-3 sm:grid-cols-2">
      <HealthCard label="you" name={playerName} hp={health[playerName] ?? 5000} pending={pendingDamage[playerName] ?? 0} correct={guessedCorrectly.includes(playerName)} />
      <HealthCard label="opponent" name={opponentName ?? "waiting"} hp={opponentName ? health[opponentName] ?? 5000 : 0} pending={opponentName ? pendingDamage[opponentName] ?? 0 : 0} correct={opponentName ? guessedCorrectly.includes(opponentName) : false} />
    </div>
    <div className="mx-auto mt-10 max-w-2xl text-center sm:mt-16">
      <div className="flex items-center justify-center gap-5 font-mono text-xs lowercase text-muted-foreground">
        <span>round {currentRound + 1}</span>
        <span className={`flex items-center gap-2 text-base ${roundSeconds !== null && roundSeconds <= 5 ? "text-warning" : "text-foreground"}`}><Clock3 size={15} /> {roundSeconds ?? "--"}s</span>
      </div>
      <h1 className="ui-title mt-5 text-3xl sm:text-5xl">name this soundtrack</h1>
      <p className="mt-3 text-sm text-muted-foreground">Type an anime title. Suggestions appear after two characters.</p>
      <form onSubmit={submit} className="relative mt-8 text-left">
        <input
          autoFocus
          value={inputValue}
          disabled={disabled}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (!suggestions.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); setSelectedIndex((index) => (index + 1) % suggestions.length); }
            if (event.key === "ArrowUp") { event.preventDefault(); setSelectedIndex((index) => (index - 1 + suggestions.length) % suggestions.length); }
          }}
          placeholder={cooldown > 0 ? `next guess in ${cooldown.toFixed(1)}s` : disabled ? "answer locked" : "start typing an anime title"}
          className="h-14 w-full rounded-md border border-border bg-input px-5 pr-14 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 sm:h-16 sm:text-lg"
          role="combobox"
          aria-expanded={suggestions.length > 0}
        />
        <button className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground sm:top-3" aria-label="Submit guess"><ArrowLeft className="rotate-180" size={17} /></button>
        {suggestions.length > 0 && (
          <div className="surface-raised quiet-scrollbar absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto p-2">
            {suggestions.map((suggestion, index) => (
              <button key={suggestion.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submitSuggestion(suggestion)} className={`interactive flex w-full items-center gap-3 rounded-md p-2 text-left ${index === selectedIndex ? "bg-accent" : "hover:bg-muted"}`}>
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md"><img src={suggestion.coverImageUrl} alt="" className="h-full w-full object-cover opacity-65" /><div className="absolute inset-0 bg-background/30" /></div>
                <div className="min-w-0"><p className="truncate font-medium">{suggestion.canonicalTitle}</p><p className="ui-label mt-1 truncate">{suggestion.romajiName ?? suggestion.nativeName ?? "anime title"}</p></div>
              </button>
            ))}
          </div>
        )}
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {canSkip && <button type="button" disabled={alreadySkipped} onClick={onSkip} className="interactive mt-6 inline-flex items-center gap-2 font-mono text-xs lowercase text-muted-foreground hover:text-foreground disabled:opacity-50"><SkipForward size={14} /> {alreadySkipped ? `skip vote sent (${skipVotes}/2)` : `vote to skip (${skipVotes}/2)`}</button>}
    </div>
  </section>
);

const HealthCard = ({ label, name, hp, pending, correct }: { label: string; name: string; hp: number; pending: number; correct: boolean }) => {
  const percentage = Math.max(0, Math.min(100, (hp / 5000) * 100));
  return <article className="surface p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="ui-label">{label}</p><p className="truncate font-medium">{name}</p></div><div className="text-right"><p className="font-mono text-sm">{hp.toLocaleString()} hp</p>{pending > 0 && <p className="ui-label text-warning">{pending} potential</p>}</div></div>
    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-input"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${percentage}%` }} /></div>
    {correct && <p className="mt-3 flex items-center gap-2 font-mono text-xs lowercase text-success"><Check size={13} /> answer locked</p>}
  </article>;
};

const RoundReveal = ({ result, revealedAnswer, playerName, detailsOpen, setDetailsOpen }: { result: RoundResult | null; revealedAnswer: string | null; playerName: string; detailsOpen: boolean; setDetailsOpen: (open: boolean) => void }) => {
  const tookDamage = result?.damagedPlayer === playerName;
  const dealtDamage = result?.damagedPlayer && result.damagedPlayer !== playerName;
  const outcome = result?.isTie ? "draw" : tookDamage ? "you took damage" : dealtDamage ? "direct hit" : "round complete";
  return <section className="event-enter mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col justify-center">
    <div className="surface-raised p-6 sm:p-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="ui-label">round reveal</p><h1 className="ui-title mt-2 text-4xl sm:text-5xl">{outcome}</h1></div><div className={`flex items-center gap-2 font-mono text-lg ${tookDamage ? "text-destructive" : dealtDamage ? "text-success" : "text-muted-foreground"}`}><Zap size={18} />{result?.damageDealt ?? 0} hp</div></div>
      <div className="mt-10 border-l-2 border-primary pl-5"><p className="ui-label">the answer</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{result?.canonicalTitle ?? revealedAnswer ?? "Answer unavailable"}</h2><p className="mt-2 text-muted-foreground">{result?.trackTitle ?? "Unknown track title"}</p></div>
      <button type="button" onClick={() => setDetailsOpen(!detailsOpen)} className="interactive mt-8 flex items-center gap-2 font-mono text-xs lowercase text-muted-foreground hover:text-foreground">details <ChevronDown className={detailsOpen ? "rotate-180" : ""} size={14} /></button>
      {detailsOpen && <div className="page-enter mt-4 grid gap-4 rounded-md border border-border bg-background/40 p-4 text-sm sm:grid-cols-2"><Detail label="romaji" value={result?.romajiName ?? "not available"} /><Detail label="native title" value={result?.nativeName ?? "not available"} />{Object.entries(result?.damageByPlayer ?? {}).map(([name, damage]) => <Detail key={name} label={`${name} potential`} value={`${damage} damage`} />)}</div>}
      <p className="ui-label mt-8 text-center">next round starting shortly</p>
    </div>
  </section>;
};

const Detail = ({ label, value }: { label: string; value: string }) => <div><p className="ui-label">{label}</p><p className="mt-1">{value}</p></div>;

const GameOver = ({ winner, playerName, health, players, history, historyOpen, setHistoryOpen, onHome, onRematch }: { winner: string | null; playerName: string; health: Record<string, number>; players: string[]; history: RoundResult[]; historyOpen: boolean; setHistoryOpen: (open: boolean) => void; onHome: () => void; onRematch: () => void }) => {
  const won = winner === playerName;
  return <section className="event-enter mx-auto max-w-3xl py-6 sm:py-12">
    <div className="text-center"><Trophy className={`mx-auto ${won ? "text-warning" : "text-muted-foreground"}`} size={32} /><p className="ui-label mt-5">match complete</p><h1 className="ui-title mt-2 text-5xl sm:text-7xl">{won ? "victory" : winner ? "defeat" : "draw"}</h1><p className="mt-4 text-muted-foreground">{winner ? `${winner} wins the match.` : "No winner this time."}</p></div>
    <div className="mt-10 grid gap-3 sm:grid-cols-2">{players.map((name) => <HealthCard key={name} label={name === playerName ? "you" : "opponent"} name={name} hp={health[name] ?? 0} pending={0} correct={false} />)}</div>
    <div className="mt-6 grid grid-cols-2 gap-3"><Button variant="outline" onClick={onHome} className="h-12 rounded-md font-mono text-xs lowercase"><Home size={15} /> home</Button><Button onClick={onRematch} className="h-12 rounded-md font-mono text-xs lowercase"><RotateCcw size={15} /> rematch</Button></div>
    {history.length > 0 && <div className="mt-8"><button type="button" onClick={() => setHistoryOpen(!historyOpen)} className="interactive flex w-full items-center justify-between border-b border-border py-3 font-mono text-xs lowercase text-muted-foreground"><span>round history · {history.length}</span><ChevronDown className={historyOpen ? "rotate-180" : ""} size={14} /></button>{historyOpen && <div className="page-enter mt-3 grid gap-2">{history.map((result, index) => <article key={`${result.titleId}-${index}`} className="rounded-md border border-border bg-card p-4"><div className="flex justify-between gap-4"><div className="min-w-0"><p className="ui-label">round {index + 1}</p><p className="mt-1 truncate font-medium">{result.canonicalTitle}</p><p className="mt-1 truncate text-sm text-muted-foreground">{result.trackTitle ?? "Unknown track"}</p></div><span className="shrink-0 font-mono text-xs text-muted-foreground">{result.damageDealt} hp</span></div></article>)}</div>}</div>}
  </section>;
};

const ActivityPanel = ({ open, onClose, messages, playerName, value, onChange, onSend }: {
  open: boolean;
  onClose: () => void;
  messages: Array<{ id: string; type: "SYSTEM" | "USER"; sender?: string; text: string }>;
  playerName: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}) => (
  <>
    <button type="button" onClick={onClose} aria-label="Close activity" className={`fixed inset-0 z-40 bg-background/70 transition-opacity lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
    <aside className={`fixed inset-y-0 right-0 z-50 flex w-[min(23rem,90vw)] flex-col border-l border-border bg-card transition-transform duration-200 lg:static lg:z-20 lg:w-80 ${open ? "translate-x-0" : "translate-x-full lg:hidden"}`}>
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <div><p className="ui-label">room activity</p><h2 className="ui-title text-base">messages</h2></div>
        <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="quiet-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="m-auto text-center"><MessageCircle className="mx-auto text-muted-foreground" size={22} /><p className="mt-3 text-sm text-muted-foreground">Nothing here yet.</p></div>
        ) : messages.slice(-50).map((message) => message.type === "SYSTEM" ? (
          <div key={message.id} className="rounded-md bg-muted px-3 py-2 text-center font-mono text-[11px] lowercase text-muted-foreground">{message.text}</div>
        ) : (
          <div key={message.id} className={`max-w-[88%] ${message.sender === playerName ? "self-end" : "self-start"}`}><p className="ui-label mb-1">{message.sender === playerName ? "you" : message.sender}</p><p className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-5">{message.text}</p></div>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="flex gap-2 border-t border-border p-3">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="send a message" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-input px-3 text-sm outline-none focus:border-primary" />
        <button className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-label="Send message"><Send size={14} /></button>
      </form>
    </aside>
  </>
);

const phaseLabel = (phase: string) => ({ LOBBY: "lobby", COUNTDOWN: "starting soon", PLAYING: "now playing", GRACE_PERIOD: "final guesses", REVEAL: "round reveal", GAME_OVER: "match complete", ROUND_END: "round complete" }[phase] ?? phase.toLowerCase());

export default Room;
