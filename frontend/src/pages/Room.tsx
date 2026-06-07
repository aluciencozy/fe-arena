import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube, { type YouTubeEvent } from "react-youtube";
import { useGameStore, useGameStateStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";
import { GameStartSequence } from "@/components/GameStartSequence";

const Room = () => {
  const { id: dynamicRoomId } = useParams(); // Get the room ID from the URL
  const navigate = useNavigate(); // Hook to programmatically navigate between routes

  if (!dynamicRoomId) {
    navigate("/"); // Redirect to home if no room ID is present
    return null; // Render nothing while redirecting
  }

  // Access player name and game state from the global stores
  const playerName = useGameStore((state) => state.playerName);
  const phase = useGameStateStore((state) => state.phase);
  const currentVideoId = useGameStateStore((state) => state.currentVideoID);
  const videoStartTime = useGameStateStore((state) => state.videoStartTime);
  const roundStartTime = useGameStateStore((state) => state.roundStartTime);
  const currentRound = useGameStateStore((state) => state.currentRound);
  const health = useGameStateStore((state) => state.health);
  const ready = useGameStateStore((state) => state.ready);
  const winner = useGameStateStore((state) => state.winner);
  const revealedAnswer = useGameStateStore((state) => state.revealedAnswer);
  const countdownEndsAt = useGameStateStore((state) => state.countdownEndsAt);
  const roundEndsAt = useGameStateStore((state) => state.roundEndsAt);
  const guessedCorrectly = useGameStateStore((state) => state.guessedCorrectly);

  // Use the custom hook to manage WebSocket connections and game state synchronization
  const { players, messages, sendChatMessage, setReady } = useSocket(
    dynamicRoomId,
    playerName,
  );
  
  const [now, setNow] = useState(Date.now());
  const [guessValue, setGuessValue] = useState("");
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [visualPhase, setVisualPhase] = useState(phase);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasActiveTimer = countdownEndsAt !== null || roundEndsAt !== null;

  // Clear chat / capture timestamp when active game starts
  useEffect(() => {
    if (phase === "INTRO_ANIMATION" || phase === "COUNTDOWN" || phase === "PLAYING") {
      setGameStartTime(Date.now());
    } else if (phase === "LOBBY") {
      setGameStartTime(null);
    }
  }, [phase]);

  // Sync visualPhase with phase, delaying the transition from LOBBY to COUNTDOWN
  // until the overlay settled state finishes and the screen starts fading back to the game (4.8s delay)
  useEffect(() => {
    if (phase === "INTRO_ANIMATION" && visualPhase === "LOBBY") {
      const timer = setTimeout(() => {
        setVisualPhase("COUNTDOWN");
      }, 4800);
      return () => clearTimeout(timer);
    } else if (phase !== "INTRO_ANIMATION") {
      setVisualPhase(phase);
    }
  }, [phase, visualPhase]);

  // Auto scroll to the bottom of the log when new messages arrive or game starts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, gameStartTime]);

  useEffect(() => {
    if (!hasActiveTimer) return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [hasActiveTimer]);

  const countdownSeconds = countdownEndsAt
    ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000))
    : null;
  const roundSeconds = roundEndsAt
    ? Math.max(0, Math.ceil((roundEndsAt - now) / 1000))
    : null;

  const handlePlayerReady = (event: YouTubeEvent) => {
    if (!roundStartTime) return; // Ensure round start time is set before calculating elapsed time

    const elapsedTime = (Date.now() - roundStartTime) / 1000; // Calculate elapsed time in seconds
    const syncTime = videoStartTime + elapsedTime; // Calculate the time to sync the video to

    event.target.seekTo(syncTime, true); // Seek the video to the calculated sync time
    event.target.playVideo(); // Start playing the video
  };

  const handleGuessSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!guessValue.trim()) return;
    sendChatMessage(guessValue.trim());
    setGuessValue("");
  };

  // Unified Centered Core Component containing Chat log, Guess Input, and Game State headers
  const renderCenteredCore = () => {
    // Filter visible game messages using start timestamp to clear lobby logs on transition
    const gameMessages = gameStartTime 
      ? messages.filter((msg) => msg.timestamp >= gameStartTime)
      : messages;

    return (
      <div className="w-[420px] pointer-events-auto flex flex-col gap-4">
        
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

            {/* Scrollable Center Chat Box Container (50 Message capacity during play) */}
            {visualPhase !== "LOBBY" && (
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
                                {isSelf ? "CORRECT! YOU GUESSED IT!" : "CORRECT ANSWER DETECTED: [████████]"}
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
            <form onSubmit={handleGuessSubmit} className="flex flex-col gap-2 pointer-events-auto">
              <input
                value={guessValue}
                onChange={(e) => setGuessValue(e.target.value)}
                placeholder={visualPhase === "LOBBY" ? "TYPE A LOBBY MESSAGE..." : "GUESS THE OST..."}
                disabled={phase === "REVEAL" || phase === "GAME_OVER" || (phase !== "LOBBY" && guessedCorrectly.includes(playerName))}
                className="w-full text-center bg-input border border-border text-foreground px-4 py-3 rounded-lg font-bold text-xs uppercase placeholder-zinc-600 shadow-md focus:outline-none focus:border-player-1 focus:ring-1 focus:ring-player-1/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                autoComplete="off"
                autoFocus
              />
            </form>

            {/* Timer status indicator during active rounds */}
            {visualPhase !== "LOBBY" && (
              <div className="text-center font-bold text-[10px] uppercase tracking-widest text-zinc-400 bg-input/80 px-3 py-1.5 select-none self-center border border-border rounded-md shadow-sm">
                TIMER: {roundSeconds ?? "--"}S LEFT
              </div>
            )}
          </>
        )}

        {/* Overlay results / alerts inside core */}
        {revealedAnswer && visualPhase !== "LOBBY" && (
          <div className="border border-player-1 bg-card text-player-1 py-2 px-4 text-center font-extrabold text-xs rounded-lg shadow-[0_0_10px_var(--player-1-glow)] select-none">
            ANSWER: {revealedAnswer.toUpperCase()}
          </div>
        )}
        
        {winner && visualPhase !== "LOBBY" && (
          <div className="border border-player-2 bg-card text-player-2 text-center font-extrabold text-sm py-3 px-6 rounded-lg uppercase tracking-widest shadow-[0_0_12px_var(--player-2-glow)] animate-pulse mt-2 select-none">
            WINNER: {winner.toUpperCase()}
          </div>
        )}

        {/* Rematch button inside core if game is over */}
        {phase === "GAME_OVER" && (
          <button
            onClick={() => setReady()}
            className="w-full font-extrabold text-xs uppercase tracking-widest py-3 border border-player-1 bg-player-1/10 hover:bg-player-1/25 text-player-1 rounded-lg transition-all shadow-[0_0_15px_rgba(77,255,188,0.2)] hover:shadow-[0_0_25px_rgba(77,255,188,0.4)] cursor-pointer active:translate-y-px pointer-events-auto"
          >
            REMATCH READY UP
          </button>
        )}

      </div>
    );
  };

  // Extract most recent message for player 1 (you) and player 2 (opponent) for lobby speech bubbles
  const lastPlayerMsg = messages
    .filter((m) => m.type === "USER" && m.sender === playerName)
    .slice(-1)[0];

  const opponentName = players.find((p) => p !== playerName) || null;
  const lastOpponentMsg = opponentName
    ? messages
        .filter((m) => m.type === "USER" && m.sender === opponentName)
        .slice(-1)[0]
    : null;

  const playerReady = ready[playerName] || false;
  const opponentReady = opponentName ? (ready[opponentName] || false) : false;

  return (
    <div className="relative w-screen h-screen overflow-hidden text-foreground bg-background bg-[radial-gradient(circle_at_center,_rgba(31,40,51,0.15)_0%,_rgba(11,15,25,1)_100%)] transition-colors duration-500">
      
      {/* Game start animation overlay */}
      <GameStartSequence 
        playerName={playerName} 
        opponentName={opponentName} 
      />
      
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
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto select-none">
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
          <div className="gaming-card-glass p-4 w-80 pointer-events-auto flex flex-col gap-2.5 player-1-glow border-t-2 border-t-player-1 animate-fade-in">
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
                className="h-full bg-player-1 transition-all duration-300 ease-out shadow-[0_0_8px_var(--player-1-glow)]" 
                style={{ width: `${Math.max(0, Math.min(100, ((health[playerName] ?? 5000) / 5000) * 100))}%` }}
              ></div>
            </div>
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
              <div className="gaming-card-glass p-4 w-80 pointer-events-auto flex flex-col gap-2.5 player-2-glow border-t-2 border-t-player-2 animate-fade-in">
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
                    className="h-full bg-player-2 transition-all duration-300 ease-out shadow-[0_0_8px_var(--player-2-glow)]" 
                    style={{ width: `${hasOpponent ? Math.max(0, Math.min(100, ((health[oppName] ?? 5000) / 5000) * 100)) : 0}%` }}
                  ></div>
                </div>
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
