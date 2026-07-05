import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube, { type YouTubeEvent } from "react-youtube";
import Fuse from "fuse.js";
import { CheckCircle2, Settings, Volume2, VolumeX, Waves, Zap } from "lucide-react";
import { useGameStore, useGameStateStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";
import type { AnswerOption } from "@/types";

const Room = () => {
  const { id: dynamicRoomId } = useParams(); // Get the room ID from the URL
  const navigate = useNavigate(); // Hook to programmatically navigate between routes
  const roomCode = dynamicRoomId ?? "";

  // Access player name and game state from the global stores
  const playerName = useGameStore((state) => state.playerName);
  const volume = useGameStore((state) => state.volume);
  const setVolume = useGameStore((state) => state.setVolume);
  const phase = useGameStateStore((state) => state.phase);
  const currentVideoId = useGameStateStore((state) => state.currentVideoID);
  const videoStartTime = useGameStateStore((state) => state.videoStartTime);
  const currentVideoDurationSeconds = useGameStateStore(
    (state) => state.currentVideoDurationSeconds,
  );
  const roundStartTime = useGameStateStore((state) => state.roundStartTime);
  const currentRound = useGameStateStore((state) => state.currentRound);
  const health = useGameStateStore((state) => state.health);
  const pendingDamage = useGameStateStore((state) => state.pendingDamage);
  const ready = useGameStateStore((state) => state.ready);
  const winner = useGameStateStore((state) => state.winner);
  const revealedAnswer = useGameStateStore((state) => state.revealedAnswer);
  const roundResult = useGameStateStore((state) => state.roundResult);
  const countdownEndsAt = useGameStateStore((state) => state.countdownEndsAt);
  const roundEndsAt = useGameStateStore((state) => state.roundEndsAt);
  const guessedCorrectly = useGameStateStore((state) => state.guessedCorrectly);
  const answerOptions = useGameStateStore((state) => state.answerOptions);

  // Use the custom hook to manage WebSocket connections and game state synchronization
  const { players, messages, sendChatMessage, setReady } = useSocket(
    roomCode,
    playerName,
  );
  
  const [now, setNow] = useState<number | null>(null);
  const [guessValue, setGuessValue] = useState("");
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] =
    useState(0);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visualPhase = phase;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubeEvent["target"] | null>(null);
  const hasActiveTimer = countdownEndsAt !== null || roundEndsAt !== null;
  const playerVolume = volume === 0 ? 0 : Math.max(1, Math.round((volume / 100) ** 2 * 100));
  const alreadyGuessedCorrectly = guessedCorrectly.includes(playerName);
  const canUseAnswerSuggestions =
    (phase === "PLAYING" || phase === "GRACE_PERIOD") &&
    !alreadyGuessedCorrectly;
  const isGuessInputDisabled =
    phase === "REVEAL" ||
    phase === "GAME_OVER" ||
    (phase !== "LOBBY" && alreadyGuessedCorrectly);
  const answerFuse = useMemo(
    () =>
      new Fuse(answerOptions, {
        keys: [
          { name: "canonicalTitle", weight: 0.65 },
          { name: "searchTerms", weight: 0.35 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [answerOptions],
  );
  const answerSuggestions = useMemo(() => {
    const query = guessValue.trim();
    if (!canUseAnswerSuggestions || query.length < 2) return [];

    return answerFuse.search(query).slice(0, 5).map((result) => result.item);
  }, [answerFuse, canUseAnswerSuggestions, guessValue]);
  const selectedSuggestionIndex =
    answerSuggestions.length === 0
      ? 0
      : Math.min(highlightedSuggestionIndex, answerSuggestions.length - 1);
  const showRoundResult =
    visualPhase === "REVEAL" || visualPhase === "GAME_OVER";

  useEffect(() => {
    if (!dynamicRoomId || !playerName) {
      navigate("/", { replace: true });
    }
  }, [dynamicRoomId, navigate, playerName]);

  // Clear chat / capture timestamp when active game starts
  useEffect(() => {
    if (phase === "COUNTDOWN" || phase === "PLAYING") {
      const timer = window.setTimeout(() => setGameStartTime(Date.now()), 0);
      return () => window.clearTimeout(timer);
    }

    if (phase === "LOBBY") {
      const timer = window.setTimeout(() => setGameStartTime(null), 0);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  // Auto scroll to the bottom of the log when new messages arrive or game starts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, gameStartTime]);

  useEffect(() => {
    if (!hasActiveTimer) return;

    const immediateTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearTimeout(immediateTimer);
      window.clearInterval(timer);
    };
  }, [hasActiveTimer]);

  useEffect(() => {
    playerRef.current?.setVolume(playerVolume);
  }, [playerVolume]);

  const countdownSeconds = countdownEndsAt
    ? now === null
      ? null
      : Math.max(0, Math.ceil((countdownEndsAt - now) / 1000))
    : null;
  const roundSeconds = roundEndsAt
    ? now === null
      ? null
      : Math.max(0, Math.ceil((roundEndsAt - now) / 1000))
    : null;

  const handlePlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    event.target.setVolume(playerVolume);

    if (!roundStartTime) return; // Ensure round start time is set before calculating elapsed time

    const elapsedTime = Math.max(0, (Date.now() - roundStartTime) / 1000);
    const rawSyncTime = videoStartTime + elapsedTime;
    const syncTime =
      currentVideoDurationSeconds && currentVideoDurationSeconds > 0
        ? rawSyncTime % currentVideoDurationSeconds
        : rawSyncTime;

    event.target.seekTo(syncTime, true); // Seek the video to the calculated sync time
    event.target.playVideo(); // Start playing the video
  };

  const handlePlayerEnd = (event: YouTubeEvent) => {
    if (phase !== "PLAYING" && phase !== "GRACE_PERIOD") return;

    event.target.seekTo(0, true);
    event.target.playVideo();
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(event.target.value));
  };

  const handleTestVolume = () => {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const nowTime = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, nowTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, nowTime + 0.18);

    gainNode.gain.setValueAtTime(0, nowTime);
    gainNode.gain.linearRampToValueAtTime((playerVolume / 100) * 0.2, nowTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, nowTime + 0.35);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(nowTime);
    oscillator.stop(nowTime + 0.35);
    oscillator.addEventListener("ended", () => void audioContext.close());
  };

  const handleGuessChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setGuessValue(event.target.value);
    setHighlightedSuggestionIndex(0);
  };

  const submitGuess = (message: string) => {
    if (!message.trim()) return;
    sendChatMessage(message.trim());
    setGuessValue("");
  };

  const submitSuggestion = (suggestion: AnswerOption) => {
    submitGuess(suggestion.canonicalTitle);
  };

  const handleGuessSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selectedSuggestion = answerSuggestions[selectedSuggestionIndex];
    if (selectedSuggestion) {
      submitSuggestion(selectedSuggestion);
      return;
    }

    submitGuess(guessValue);
  };

  const handleGuessKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (answerSuggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSuggestionIndex(
        (index) => (index + 1) % answerSuggestions.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSuggestionIndex(
        (index) =>
          (index - 1 + answerSuggestions.length) % answerSuggestions.length,
      );
    }
  };

  const opponentName = players.find((p) => p !== playerName) || null;
  const playerReady = ready[playerName] || false;
  const opponentReady = opponentName ? (ready[opponentName] || false) : false;
  const correctGuessFeed = guessedCorrectly.map((name) => ({
    name,
    isSelf: name === playerName,
  }));

  const renderCorrectGuessFeed = () => {
    if (correctGuessFeed.length === 0 || showRoundResult) return null;

    return (
      <div className="correct-feed" aria-live="polite">
        {correctGuessFeed.map(({ name, isSelf }) => (
          <div
            key={name}
            className={`correct-feed-item ${
              isSelf ? "correct-feed-item-self" : "correct-feed-item-opponent"
            }`}
          >
            <CheckCircle2 size={17} />
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase text-foreground">
                {isSelf ? "You locked the answer" : `${name} locked the answer`}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Damage will resolve after the response window
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderRoundResultPanel = () => {
    if (!showRoundResult || (!roundResult && !revealedAnswer)) return null;

    const damageRows = players.map((name) => ({
      name,
      damage: roundResult?.damageByPlayer[name] ?? pendingDamage[name] ?? 0,
    }));
    const [firstDamage, secondDamage] = damageRows;
    const damageFormula =
      firstDamage && secondDamage
        ? `${firstDamage.damage} - ${secondDamage.damage} = ${Math.abs(
            firstDamage.damage - secondDamage.damage,
          )}`
        : null;
    const isWin = winner === playerName;
    const resultTone =
      winner === null ? "neutral" : isWin ? "win" : "loss";
    const resultLabel =
      winner === null
        ? roundResult?.isTie
          ? "No damage dealt"
          : "Round result"
        : isWin
          ? "Victory"
          : "Defeat";
    const resultSubtitle =
      winner === null
        ? "Next round incoming"
        : isWin
          ? "You survived the duel"
          : "Your HP hit zero";

    return (
      <section
        className={`round-result-panel round-result-panel-${resultTone} pointer-events-auto select-none`}
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {visualPhase === "GAME_OVER" ? "Game over" : "Round reveal"}
            </p>
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-wide text-foreground">
              {resultLabel}
            </h2>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {resultSubtitle}
            </p>
          </div>
          {roundResult?.damageDealt ? (
            <div className="damage-pop border border-player-2 bg-player-2 px-4 py-2 text-right text-background">
              <p className="text-[9px] font-black uppercase tracking-widest">
                Damage
              </p>
              <p className="text-2xl font-black leading-none">
                {roundResult.damageDealt}
              </p>
            </div>
          ) : (
            <div className="border border-border bg-input px-4 py-2 text-right text-muted-foreground">
              <p className="text-[9px] font-black uppercase tracking-widest">
                Damage
              </p>
              <p className="text-xl font-black leading-none">0</p>
            </div>
          )}
        </div>

        <div className="mt-5 border-l-2 border-player-1 pl-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-player-1">
            Exact song title
          </p>
          <p className="mt-1 text-xl font-black text-foreground">
            {roundResult?.trackTitle ?? "Unknown track title"}
          </p>
        </div>

        <div className="mt-4 grid gap-3 border border-border bg-background/70 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Anime title
            </p>
            <p className="mt-1 text-lg font-black uppercase text-foreground">
              {roundResult?.canonicalTitle ?? revealedAnswer}
            </p>
          </div>
          {(roundResult?.romajiName || roundResult?.nativeName) && (
            <div className="grid grid-cols-2 gap-3 text-xs font-bold text-muted-foreground">
              <span>{roundResult.romajiName ?? "No romaji title"}</span>
              <span className="text-right">
                {roundResult.nativeName ?? "No native title"}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2">
          {damageRows.map(({ name, damage }) => {
            const isSelf = name === playerName;
            const wasDamaged = roundResult?.damagedPlayer === name;
            return (
              <div
                key={name}
                className={`damage-row flex items-center justify-between border bg-input px-3 py-2 text-xs font-black uppercase tracking-wider ${
                  isSelf
                    ? "border-player-1/60 text-player-1"
                    : "border-player-2/60 text-player-2"
                } ${wasDamaged ? "damage-row-hit" : ""}`}
              >
                <span>{isSelf ? `${name} / you` : name}</span>
                <span className="flex items-center gap-2">
                  {wasDamaged && roundResult?.damageDealt ? (
                    <span className="text-foreground">-{roundResult.damageDealt} HP</span>
                  ) : null}
                  <span>{damage} potential</span>
                </span>
              </div>
            );
          })}
        </div>

        {damageFormula && (
          <div className="mt-4 flex items-center justify-between border border-border bg-card px-4 py-3 text-xs font-black uppercase tracking-widest">
            <span className="text-muted-foreground">Damage calculation</span>
            <span className="text-foreground">{damageFormula}</span>
          </div>
        )}

        <p className="mt-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {roundResult?.damagedPlayer
            ? `${roundResult.damagedPlayer} took ${roundResult.damageDealt} damage`
            : "Equal damage or no correct guesses"}
        </p>
      </section>
    );
  };

  // Unified Centered Core Component containing Chat log, Guess Input, and Game State headers
  const renderCenteredCore = () => {
    // Filter visible game messages using start timestamp to clear lobby logs on transition
    const gameMessages = gameStartTime 
      ? messages.filter((msg) => msg.timestamp >= gameStartTime)
      : messages;

    return (
      <div
        key={visualPhase}
        className={`phase-shell phase-shell-${visualPhase.toLowerCase().replace("_", "-")} w-[420px] pointer-events-auto flex flex-col gap-4`}
      >
        
        {/* Dynamic Countdown Display */}
        {visualPhase === "COUNTDOWN" ? (
          <div className="text-center bg-card border border-border/80 text-foreground p-8 rounded-2xl shadow-2xl font-extrabold text-6xl my-8 select-none animate-scale-up tracking-wider border-t-2 border-t-player-1 player-1-glow">
            {countdownSeconds ?? "5"}
          </div>
        ) : (
          <>
            {/* Header metadata label */}
            {visualPhase !== "LOBBY" && (
              <div className="text-center bg-card text-muted-foreground py-2 px-4 border border-border/80 rounded-lg font-bold uppercase text-[10px] tracking-widest select-none shadow-md">
                {`ROUND ${currentRound + 1}`}
              </div>
            )}

            {renderCorrectGuessFeed()}
            {renderRoundResultPanel()}

            {/* Scrollable Center Chat Box Container (50 Message capacity during play) */}
            {visualPhase !== "LOBBY" && !showRoundResult && (
              <div className="h-[280px] overflow-y-auto pr-1 flex flex-col gap-3 select-none pointer-events-auto gaming-card-glass p-3 no-scrollbar border-border/40 shadow-xl">
                {gameMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                    No dialogue yet...
                  </div>
                ) : (
                  gameMessages.slice(-50).map((msg) => {
                    if (msg.type === "SYSTEM") {
                      const isCorrect = msg.text.includes("guessed correctly.");
                      if (isCorrect) {
                        const guessedUser = msg.text.split(" ")[0] || "";
                        const isSelf = guessedUser === playerName;
                        return (
                          <div key={msg.id} className={`flex flex-col gap-1 w-full max-w-[85%] ${isSelf ? 'items-start self-start' : 'items-end self-end'}`}>
                            <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded text-background ${isSelf ? 'bg-player-1 shadow-[0_0_8px_var(--player-1-glow)]' : 'bg-player-2 shadow-[0_0_8px_var(--player-2-glow)]'}`}>
                              {guessedUser}
                            </span>
                            <div className={`relative border bg-card px-4 py-2.5 text-xs font-bold rounded-lg shadow-md ${isSelf ? 'border-player-1/60 border-l-4 border-l-player-1 text-player-1 shadow-[0_0_10px_var(--player-1-glow)]' : 'border-player-2/60 border-r-4 border-r-player-2 text-player-2 shadow-[0_0_10px_var(--player-2-glow)]'}`}>
                              <p className="break-all whitespace-pre-wrap">
                                {isSelf ? "CORRECT! YOU GUESSED IT!" : "CORRECT ANSWER DETECTED: [HIDDEN]"}
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id} className="text-center text-[10px] text-zinc-400 bg-input/60 border border-border/50 py-1 px-3 self-center font-bold uppercase tracking-wider rounded-md">
                          SYSTEM: {msg.text}
                        </div>
                      );
                    }

                    const isSelf = msg.sender === playerName;
                    return (
                      <div key={msg.id} className={`flex flex-col gap-1 w-full max-w-[85%] ${isSelf ? 'items-start self-start' : 'items-end self-end'}`}>
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded text-background ${isSelf ? 'bg-player-1' : 'bg-player-2'}`}>
                          {msg.sender}
                        </span>
                        <div className={`relative border border-border/80 bg-card/85 text-foreground px-4 py-2.5 shadow-md text-xs font-semibold rounded-lg ${isSelf ? 'border-l-4 border-l-player-1' : 'border-r-4 border-r-player-2'}`}>
                          <p className="break-all whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                {/* Scroll Target */}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Central Guess/Chat Input Form */}
            <form onSubmit={handleGuessSubmit} className="relative flex flex-col gap-2 pointer-events-auto">
              <input
                value={guessValue}
                onChange={handleGuessChange}
                onKeyDown={handleGuessKeyDown}
                placeholder={visualPhase === "LOBBY" ? "TYPE A LOBBY MESSAGE..." : "GUESS THE OST..."}
                disabled={isGuessInputDisabled}
                className="w-full text-center bg-input border border-border text-foreground px-4 py-3 rounded-lg font-bold text-xs uppercase placeholder-zinc-600 shadow-md focus:outline-none focus:border-player-1 focus:ring-1 focus:ring-player-1/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                autoComplete="off"
                autoFocus
              />
              {answerSuggestions.length > 0 && (
                <div className="answer-suggestions absolute left-0 right-0 top-full z-50 mt-2 grid max-h-[360px] gap-2 overflow-y-auto rounded-lg border border-player-1/40 bg-background/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-md">
                  {answerSuggestions.map((suggestion, index) => {
                    const isSelected = index === selectedSuggestionIndex;
                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => submitSuggestion(suggestion)}
                        className={`answer-suggestion-row group relative min-h-20 overflow-hidden px-4 py-3 text-left transition-all ${
                          isSelected
                            ? "answer-suggestion-row-selected"
                            : "hover:border-player-1/70"
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-3/5 opacity-65">
                          <img
                            src={suggestion.coverImageUrl}
                            alt=""
                            aria-hidden="true"
                            className="ml-auto h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                        <div className="relative z-10 flex min-h-14 items-center justify-between gap-3">
                          <div className="min-w-0 max-w-[76%]">
                            <p className="truncate text-sm font-black uppercase tracking-wide text-foreground">
                              {suggestion.canonicalTitle}
                            </p>
                            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {suggestion.romajiName ??
                                suggestion.nativeName ??
                                "Anime title"}
                            </p>
                          </div>
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded border text-xs font-black ${
                              isSelected
                                ? "border-player-1 bg-player-1 text-background"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {isSelected ? "OK" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </form>

            {/* Timer status indicator during active rounds */}
            {visualPhase !== "LOBBY" && (
              <div className="text-center font-bold text-[10px] uppercase tracking-widest text-zinc-400 bg-input/80 px-3 py-1.5 select-none self-center border border-border rounded-md shadow-sm">
                TIMER: {roundSeconds ?? "--"}S LEFT
              </div>
            )}
          </>
        )}

        {/* Rematch button inside core if game is over */}
        {phase === "GAME_OVER" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/")}
              className="w-full font-extrabold text-xs uppercase tracking-widest py-3 border border-border bg-input hover:bg-muted text-foreground rounded-lg transition-all cursor-pointer active:translate-y-px pointer-events-auto"
            >
              BACK HOME
            </button>
            <button
              onClick={() => setReady()}
              className="w-full font-extrabold text-xs uppercase tracking-widest py-3 border border-player-1 bg-player-1/10 hover:bg-player-1/25 text-player-1 rounded-lg transition-all shadow-[0_0_15px_rgba(77,255,188,0.2)] hover:shadow-[0_0_25px_rgba(77,255,188,0.4)] cursor-pointer active:translate-y-px pointer-events-auto"
            >
              REMATCH
            </button>
          </div>
        )}

      </div>
    );
  };

  // Extract most recent message for player 1 (you) and player 2 (opponent) for lobby speech bubbles
  const lastPlayerMsg = messages
    .filter((m) => m.type === "USER" && m.sender === playerName)
    .slice(-1)[0];

  const lastOpponentMsg = opponentName
    ? messages
        .filter((m) => m.type === "USER" && m.sender === opponentName)
        .slice(-1)[0]
    : null;

  if (!dynamicRoomId || !playerName) {
    return null;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden text-foreground bg-background bg-[radial-gradient(circle_at_center,_rgba(31,40,51,0.15)_0%,_rgba(11,15,25,1)_100%)] transition-colors duration-500">
      <div className="absolute right-5 top-5 z-[60] pointer-events-auto">
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Open settings"
          className="flex size-10 items-center justify-center border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition-all hover:border-player-1 hover:text-player-1 active:translate-y-px"
        >
          <Settings size={18} />
        </button>

        {settingsOpen && (
          <div className="absolute right-0 mt-3 w-72 border border-border bg-card p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {volume === 0 ? (
                  <VolumeX className="text-player-2" size={18} />
                ) : (
                  <Volume2 className="text-player-1" size={18} />
                )}
                <span className="text-xs font-extrabold uppercase tracking-widest">
                  Volume
                </span>
              </div>
              <span className="text-xs font-black text-muted-foreground">
                {volume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={volume}
              onChange={handleVolumeChange}
              aria-label="App volume"
              className="h-2 w-full cursor-pointer accent-player-1"
            />
            <button
              type="button"
              onClick={handleTestVolume}
              className="mt-4 flex w-full items-center justify-center gap-2 border border-player-1/50 bg-player-1/10 px-3 py-2 text-xs font-extrabold uppercase tracking-widest text-player-1 transition-all hover:bg-player-1/20 active:translate-y-px"
            >
              <Waves size={15} />
              Test Volume
            </button>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Low settings are softened for quieter listening.
            </p>
          </div>
        )}
      </div>

      {/* BACKGROUND LAYER 1: Lobby Split-Slash (LOBBY phase only) */}
      {/* ---------------------------------------------------- */}
      {visualPhase === "LOBBY" && (
        <div className="absolute inset-0 z-10 pointer-events-none select-none">
          {/* LEFT SLASH HALF (YOU) */}
          <div className="absolute inset-0 clip-slash-left bg-gradient-to-r from-[rgba(11,15,25,0.95)] via-[rgba(31,40,51,0.85)] to-transparent text-foreground flex flex-col justify-center items-start pl-24 pr-48 transition-all duration-500">
            <span className="text-[10px] font-extrabold uppercase tracking-widest bg-player-1 text-background px-3 py-1 mb-2 transform -skew-x-12 shadow-[0_0_10px_var(--player-1-glow)]">
              PLAYER ONE // YOU
            </span>
            
            <div className="flex items-center gap-6 relative">
              <h2 className="text-6xl font-extrabold uppercase tracking-tighter text-player-1 text-player-1-glow">
                {playerName}
              </h2>
              {/* Single floating message box to the right of your name */}
              {lastPlayerMsg && (
                <div className="relative border border-player-1/50 bg-card px-5 py-3 shadow-[0_0_12px_var(--player-1-glow)] text-xs font-semibold rounded-lg max-w-xs animate-scale-up z-20 pointer-events-auto border-l-4 border-l-player-1">
                  <p className="break-all whitespace-pre-wrap text-foreground">{lastPlayerMsg.text}</p>
                </div>
              )}
            </div>

            {/* Ready controls positioned directly below Player 1 name inside left slot */}
            <div className="flex flex-col items-start mt-6 gap-3 pointer-events-auto">
              <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 border rounded-md transition-all ${playerReady ? "bg-player-1 text-background border-player-1 shadow-[0_0_10px_var(--player-1-glow)]" : "bg-transparent text-zinc-500 border-zinc-700 border-dashed"}`}>
                {playerReady ? "READIED" : "NOT READY"}
              </span>
              {players.length === 2 && (
                <button
                  onClick={() => setReady()}
                  className={`px-5 py-2.5 border rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer select-none active:translate-y-px ${playerReady ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800" : "border-player-1 text-player-1 hover:bg-player-1/10 shadow-[0_0_10px_var(--player-1-glow)]"}`}
                >
                  {playerReady ? "UNREADY" : "READY UP"}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT SLASH HALF (OPPONENT / WAITING) */}
          <div className="absolute inset-0 clip-slash-right bg-gradient-to-l from-[rgba(11,15,25,0.95)] via-[rgba(31,40,51,0.85)] to-transparent text-foreground flex flex-col justify-center items-end pr-24 pl-48 transition-all duration-500">
            {opponentName ? (
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-extrabold uppercase tracking-widest bg-player-2 text-background px-3 py-1 mb-2 transform -skew-x-12 shadow-[0_0_10px_var(--player-2-glow)]">
                  PLAYER TWO // CHALLENGER
                </span>
                
                <div className="flex items-center gap-6 relative">
                  {/* Single floating message box to the left of opponent's name */}
                  {lastOpponentMsg && (
                    <div className="relative border border-player-2/50 bg-card px-5 py-3 shadow-[0_0_12px_var(--player-2-glow)] text-xs font-semibold rounded-lg max-w-xs animate-scale-up z-20 pointer-events-auto border-r-4 border-r-player-2">
                      <p className="break-all whitespace-pre-wrap text-foreground">{lastOpponentMsg.text}</p>
                    </div>
                  )}
                  <h2 className="text-6xl font-extrabold uppercase tracking-tighter text-player-2 text-player-2-glow">
                    {opponentName}
                  </h2>
                </div>

                <div className="flex items-center gap-2 mt-6">
                  <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 border rounded-md transition-all ${opponentReady ? "bg-player-2 text-background border-player-2 shadow-[0_0_10px_var(--player-2-glow)]" : "bg-transparent text-zinc-500 border-zinc-700 border-dashed"}`}>
                    {opponentReady ? "READIED" : "NOT READY"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end animate-pulse">
                <span className="text-[10px] font-extrabold uppercase tracking-widest bg-zinc-800 text-zinc-400 px-3 py-1 mb-2 rounded border border-zinc-700">
                  PLAYER TWO // LOBBY EMPTY
                </span>
                <h2 className="text-5xl font-extrabold uppercase tracking-tighter italic text-center text-zinc-600">
                  WAITING FOR CHALLENGER...
                </h2>
              </div>
            )}
          </div>

          {/* DIAGONAL DIVISION STROKE & CENTER VS BADGE */}
          <div className="absolute inset-0 z-20 flex justify-center items-center">
            <div className="w-[4px] h-[150%] rotate-[168deg] transform origin-center absolute split-divider-line transition-all duration-500"></div>
            {players.length === 2 && (
              <div className="bg-card text-foreground border border-border font-extrabold text-4xl py-3 px-7 rounded-xl shadow-2xl rotate-[-10deg] z-30 select-none tracking-widest">
                <span className="bg-gradient-to-r from-player-1 to-player-2 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(77,255,188,0.3)]">VS</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BACKGROUND LAYER 2: Dimmed active play overlay */}
      {/* ---------------------------------------------------- */}
      {visualPhase !== "LOBBY" && (
        <div className="absolute inset-0 bg-black/15 dark:bg-black/40 z-0 pointer-events-none"></div>
      )}

      {/* Hidden/Invisible Audio Stage */}
      <div className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none overflow-hidden">
        {(phase === "PLAYING" || phase === "GRACE_PERIOD") && currentVideoId && (
          <YouTube
            videoId={currentVideoId}
            opts={{
              width: "1",
              height: "1",
              playerVars: {
                autoplay: 1,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0,
              }
            }}
            onReady={handlePlayerReady}
            onEnd={handlePlayerEnd}
          />
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* FOREGROUND LAYER 1: Centered Chat & Guess Core Stage */}
      {/* ---------------------------------------------------- */}
      <div className={`absolute inset-0 flex flex-col items-center z-20 pointer-events-none ${visualPhase === "LOBBY" ? "justify-end pb-32" : "justify-center pb-20"}`}>
        
        {/* During Active game: render full chat core vertically centered. During Lobby: core renders centered, keeping space for split names */}
        {renderCenteredCore()}
        
        {/* Lobby warning labels at the bottom (No overlay ready up button here anymore) */}
        {visualPhase === "LOBBY" && (
          <div className="absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 transform flex-col items-center gap-3 pointer-events-auto select-none">
            <div className="border border-player-1/60 bg-card px-5 py-2 text-center shadow-[0_0_12px_var(--player-1-glow)]">
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Room Code
              </p>
              <p className="text-xl font-black uppercase tracking-[0.35em] text-player-1">
                {roomCode}
              </p>
            </div>
            {players.length < 2 && (
              <div className="text-sm font-extrabold uppercase tracking-widest text-center text-zinc-500 bg-input/80 border border-border/80 px-6 py-3 rounded-lg shadow-lg animate-pulse">
                Waiting for challenger to join...
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* FOREGROUND LAYER 2: Corner HP HUDs (PLAYING phases only) */}
      {/* ---------------------------------------------------- */}
      {visualPhase !== "LOBBY" && (
        <div className="absolute inset-x-8 bottom-8 flex justify-between items-end pointer-events-none select-none z-10 transition-all duration-500">
          {/* Player 1 HUD (Bottom Left) */}
          <div
            className={`gaming-card-glass p-4 w-80 pointer-events-auto flex flex-col gap-2.5 player-1-glow border-t-2 border-t-player-1 animate-fade-in ${
              roundResult?.damagedPlayer === playerName ? "hud-damage-shake" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold uppercase text-sm tracking-wide text-foreground">
                PLAYER: {playerName} <span className="text-[9px] bg-player-1 text-background px-1.5 py-0.5 font-bold ml-1 rounded">YOU</span>
              </span>
              <span className="text-xs font-bold text-player-1 text-player-1-glow">
                {health[playerName] ?? 5000} HP
              </span>
            </div>
            <div className="w-full h-4 border border-border bg-input/80 rounded-md relative overflow-hidden">
              <div 
                className="health-fill h-full bg-player-1 transition-all duration-700 ease-out shadow-[0_0_8px_var(--player-1-glow)]" 
                style={{ width: `${Math.max(0, Math.min(100, ((health[playerName] ?? 5000) / 5000) * 100))}%` }}
              ></div>
            </div>
            {roundResult?.damagedPlayer === playerName && roundResult.damageDealt > 0 && (
              <span className="damage-float self-start text-player-2">
                <Zap size={13} />
                -{roundResult.damageDealt} HP
              </span>
            )}
            {guessedCorrectly.includes(playerName) && (
              <span className="text-xs font-bold uppercase text-background bg-player-1 py-1 px-3 self-start rounded-md shadow-[0_0_8px_var(--player-1-glow)] mt-1">
                CORRECT!
              </span>
            )}
          </div>

          {/* Player 2 HUD (Bottom Right) */}
          {(() => {
            const oppName = players.find((p) => p !== playerName) || "Challenger";
            const hasOpponent = players.some((p) => p !== playerName);
            return (
              <div
                className={`gaming-card-glass p-4 w-80 pointer-events-auto flex flex-col gap-2.5 player-2-glow border-t-2 border-t-player-2 animate-fade-in ${
                  roundResult?.damagedPlayer === oppName ? "hud-damage-shake" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold uppercase text-sm tracking-wide text-foreground">
                    OPPONENT: {oppName}
                  </span>
                  <span className="text-xs font-bold text-player-2 text-player-2-glow">
                    {hasOpponent ? `${health[oppName] ?? 5000} HP` : "-- HP"}
                  </span>
                </div>
                <div className="w-full h-4 border border-border bg-input/80 rounded-md relative overflow-hidden">
                  <div 
                    className="health-fill h-full bg-player-2 transition-all duration-700 ease-out shadow-[0_0_8px_var(--player-2-glow)]" 
                    style={{ width: `${hasOpponent ? Math.max(0, Math.min(100, ((health[oppName] ?? 5000) / 5000) * 100)) : 0}%` }}
                  ></div>
                </div>
                {roundResult?.damagedPlayer === oppName && roundResult.damageDealt > 0 && (
                  <span className="damage-float self-end text-player-2">
                    <Zap size={13} />
                    -{roundResult.damageDealt} HP
                  </span>
                )}
                {hasOpponent && guessedCorrectly.includes(oppName) && (
                  <span className="text-xs font-bold uppercase text-background bg-player-2 py-1 px-3 self-end rounded-md shadow-[0_0_8px_var(--player-2-glow)] mt-1">
                    CORRECT!
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
};

export default Room;
