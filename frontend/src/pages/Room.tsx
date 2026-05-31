import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube, { type YouTubeEvent } from "react-youtube";
import { useGameStore, useGameStateStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";

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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasActiveTimer = countdownEndsAt !== null || roundEndsAt !== null;

  // Clear chat / capture timestamp when active game starts
  useEffect(() => {
    if (phase === "COUNTDOWN" || phase === "PLAYING") {
      setGameStartTime(Date.now());
    } else if (phase === "LOBBY") {
      setGameStartTime(null);
    }
  }, [phase]);

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
        {phase === "COUNTDOWN" ? (
          <div className="text-center bg-black dark:bg-white text-white dark:text-black border-4 border-black dark:border-white p-8 shadow-[6px_6px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_rgba(255,255,255,1)] font-black text-6xl rotate-[-6deg] my-8 select-none animate-scale-up">
            {countdownSeconds ?? "3"}
          </div>
        ) : (
          <>
            {/* Header metadata label */}
            {phase !== "LOBBY" && (
              <div className="text-center bg-black dark:bg-white text-white dark:text-black py-1.5 px-4 border-2 border-black dark:border-white font-extrabold uppercase text-[10px] tracking-widest -skew-x-6 transform shadow-[2px_2px_0px_rgba(0,0,0,0.15)] select-none">
                {`ROUND ${currentRound + 1} // PHASE: ${phase}`}
              </div>
            )}

            {/* Scrollable Center Chat Bubble Container (50 Message capacity during play) */}
            {phase !== "LOBBY" && (
              <div className="h-[280px] overflow-y-auto pr-1 flex flex-col gap-3.5 select-none pointer-events-auto bg-white/5 dark:bg-black/5 p-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 no-scrollbar">
                {gameMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs font-black uppercase tracking-wider">
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
                            <span className="text-[9px] font-black uppercase tracking-wider bg-black dark:bg-white text-white dark:text-black px-1.5 py-0.5 border border-black dark:border-white">
                              {guessedUser}
                            </span>
                            {/* Stark monochrome bubble style for correct guesses with zero red accents */}
                            <div className="relative border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-5 py-2.5 shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] text-xs font-black rounded-[20px] border-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_rgba(255,255,255,1)]">
                              <p className="break-all whitespace-pre-wrap">
                                {isSelf ? "CORRECT! YOU GUESSED IT!" : "CORRECT ANSWER DETECTED: [████████]"}
                              </p>
                              <div className={isSelf ? "bubble-tail-left" : "bubble-tail-right"}></div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id} className="text-center text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/50 border border-dashed border-zinc-300 dark:border-zinc-800 py-1 px-3 self-center font-bold uppercase tracking-wider">
                          SYSTEM: {msg.text}
                        </div>
                      );
                    }

                    const isSelf = msg.sender === playerName;
                    return (
                      <div key={msg.id} className={`flex flex-col gap-1 w-full max-w-[85%] ${isSelf ? 'items-start self-start' : 'items-end self-end'}`}>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-black dark:bg-white text-white dark:text-black px-1.5 py-0.5 border border-black dark:border-white shadow-[1px_1px_0px_rgba(0,0,0,0.1)]">
                          {msg.sender}
                        </span>
                        <div className="relative border-2 border-black dark:border-white bg-white dark:bg-zinc-950 text-black dark:text-white px-5 py-2.5 shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] text-xs font-black rounded-[20px]">
                          <p className="break-all whitespace-pre-wrap">{msg.text}</p>
                          <div className={isSelf ? "bubble-tail-left" : "bubble-tail-right"}></div>
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
                placeholder={phase === "LOBBY" ? "TYPE A LOBBY MESSAGE..." : "GUESS THE OST..."}
                disabled={phase === "REVEAL" || phase === "GAME_OVER" || (phase !== "LOBBY" && guessedCorrectly.includes(playerName))}
                className="w-full text-center bg-white dark:bg-black text-black dark:text-white px-4 py-3.5 border-4 border-black dark:border-white font-extrabold text-xs uppercase placeholder-zinc-500 shadow-[6px_6px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_rgba(255,255,255,1)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-[4px_4px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                autoComplete="off"
                autoFocus
              />
            </form>

            {/* Timer status indicator during active rounds */}
            {phase !== "LOBBY" && (
              <div className="text-center font-black text-xs uppercase tracking-wider text-zinc-500 bg-white/80 dark:bg-black/80 px-2 py-1 select-none self-center border border-zinc-200 dark:border-zinc-800 shadow-[2px_2px_0px_rgba(0,0,0,0.05)]">
                TIMER: {roundSeconds ?? "--"}S LEFT
              </div>
            )}
          </>
        )}

        {/* Overlay results / alerts inside core */}
        {revealedAnswer && phase !== "LOBBY" && (
          <div className="border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black py-2 px-4 text-center font-extrabold text-xs shadow-[2px_2px_0px_rgba(0,0,0,0.1)] select-none">
            ANSWER: {revealedAnswer.toUpperCase()}
          </div>
        )}
        
        {winner && phase !== "LOBBY" && (
          <div className="border-4 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black text-center font-black text-xs py-2 uppercase tracking-widest shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] animate-bounce mt-1 select-none">
            WINNER: {winner.toUpperCase()}
          </div>
        )}

        {/* Rematch button inside core if game is over */}
        {phase === "GAME_OVER" && (
          <button
            onClick={() => setReady()}
            className="w-full manga-panel font-extrabold text-xs uppercase tracking-widest py-3 bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-900 cursor-pointer shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 pointer-events-auto"
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
    <div className="relative w-screen h-screen overflow-hidden bg-halftone bg-speedlines text-foreground bg-background transition-colors duration-500">
      
      {/* ---------------------------------------------------- */}
      {/* BACKGROUND LAYER 1: Lobby Split-Slash (LOBBY phase only) */}
      {/* ---------------------------------------------------- */}
      {phase === "LOBBY" && (
        <div className="absolute inset-0 z-10 pointer-events-none select-none">
          {/* LEFT SLASH HALF (YOU) */}
          <div className="absolute inset-0 clip-slash-left bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center items-start pl-24 pr-48 transition-all duration-500">
            <span className="text-[10px] font-black uppercase tracking-widest bg-black dark:bg-white text-white dark:text-black px-2 py-0.5 mb-2 -skew-x-12 transform shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              PLAYER ONE // YOU
            </span>
            
            <div className="flex items-center gap-6 relative">
              <h2 className="text-6xl font-black uppercase tracking-tighter underline decoration-double decoration-4">
                {playerName}
              </h2>
              {/* Single floating message bubble to the right of your name */}
              {lastPlayerMsg && (
                <div className="relative border-2 border-black dark:border-white bg-white dark:bg-zinc-950 text-black dark:text-white px-5 py-2.5 shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] text-xs font-black rounded-[20px] max-w-xs animate-scale-up z-20 pointer-events-auto">
                  <p className="break-all whitespace-pre-wrap">{lastPlayerMsg.text}</p>
                  <div className="bubble-tail-left"></div>
                </div>
              )}
            </div>

            {/* Ready controls positioned directly below Player 1 name inside left slot (Pure monochrome style) */}
            <div className="flex flex-col items-start mt-4 gap-3 pointer-events-auto">
              <span className={`text-sm font-black uppercase tracking-wider px-3 py-1 border-2 border-black dark:border-white shadow-[2px_2px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_rgba(255,255,255,1)] transform -rotate-1 ${playerReady ? "bg-black dark:bg-white text-white dark:text-black" : "bg-transparent text-zinc-400 dark:text-zinc-600 border-dashed"}`}>
                {playerReady ? "READIED" : "NOT READY"}
              </span>
              {players.length === 2 && (
                <button
                  onClick={() => setReady()}
                  className="px-6 py-2 border-4 border-black dark:border-white text-xs font-black uppercase tracking-widest shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer select-none"
                >
                  {playerReady ? "UNREADY" : "READY UP"}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT SLASH HALF (OPPONENT / WAITING) */}
          <div className="absolute inset-0 clip-slash-right bg-black dark:bg-white text-white dark:text-black flex flex-col justify-center items-end pr-24 pl-48 transition-all duration-500">
            {opponentName ? (
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black uppercase tracking-widest bg-white dark:bg-black text-black dark:text-white px-2 py-0.5 mb-2 -skew-x-12 transform shadow-[2px_2px_0px_rgba(255,255,255,1)]">
                  PLAYER TWO // CHALLENGER
                </span>
                
                <div className="flex items-center gap-6 relative">
                  {/* Single floating message bubble to the left of opponent's name */}
                  {lastOpponentMsg && (
                    <div className="relative border-2 border-white dark:border-black bg-white dark:bg-zinc-950 text-black dark:text-white px-5 py-2.5 shadow-[3px_3px_0px_rgba(255,255,255,1)] dark:shadow-[3px_3px_0px_rgba(0,0,0,1)] text-xs font-black rounded-[20px] max-w-xs animate-scale-up z-20 pointer-events-auto">
                      <p className="break-all whitespace-pre-wrap">{lastOpponentMsg.text}</p>
                      <div className="bubble-tail-right"></div>
                    </div>
                  )}
                  <h2 className="text-6xl font-black uppercase tracking-tighter underline decoration-double decoration-4">
                    {opponentName}
                  </h2>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <span className={`text-sm font-black uppercase tracking-wider px-3 py-1 border-2 border-white dark:border-black shadow-[2px_2px_0px_rgba(255,255,255,1)] dark:shadow-[3px_3px_0px_rgba(0,0,0,1)] transform rotate-1 ${opponentReady ? "bg-white dark:bg-black text-black dark:text-white" : "bg-transparent text-zinc-600 dark:text-zinc-400 border-dashed"}`}>
                    {opponentReady ? "READIED" : "NOT READY"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end animate-pulse">
                <span className="text-[10px] font-black uppercase tracking-widest bg-white dark:bg-black text-black dark:text-white px-2 py-0.5 mb-2">
                  PLAYER TWO // LOBBY EMPTY
                </span>
                <h2 className="text-5xl font-black uppercase tracking-tighter italic text-center text-zinc-400 dark:text-zinc-600">
                  WAITING FOR CHALLENGER...
                </h2>
              </div>
            )}
          </div>

          {/* DIAGONAL DIVISION STROKE & CENTER VS BADGE */}
          <div className="absolute inset-0 z-20 flex justify-center items-center">
            <div className="w-[8px] h-[150%] bg-black dark:bg-white rotate-[168deg] transform origin-center absolute shadow-[4px_0px_0px_rgba(0,0,0,0.15)] transition-all duration-500"></div>
            {players.length === 2 && (
              <div className="bg-black dark:bg-white text-white dark:text-black border-4 border-white dark:border-black font-black text-5xl py-4 px-8 shadow-[6px_6px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_rgba(255,255,255,1)] rotate-[-10deg] z-30 select-none tracking-widest">
                VS
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* BACKGROUND LAYER 2: Dimmed active play overlay */}
      {/* ---------------------------------------------------- */}
      {phase !== "LOBBY" && (
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
      <div className={`absolute inset-0 flex flex-col items-center z-20 pointer-events-none ${phase === "LOBBY" ? "justify-end pb-32" : "justify-center pb-20"}`}>
        
        {/* During Active game: render full chat core vertically centered. During Lobby: core renders centered, keeping space for split names */}
        {renderCenteredCore()}
        
        {/* Lobby warning labels at the bottom (No overlay ready up button here anymore) */}
        {phase === "LOBBY" && (
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto select-none">
            {players.length < 2 && (
              <div className="text-xl font-black uppercase tracking-widest text-center mix-blend-difference text-white py-4 px-8 select-none">
                Waiting for challenger to join...
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* FOREGROUND LAYER 2: Corner HP HUDs (PLAYING phases only) */}
      {/* ---------------------------------------------------- */}
      {phase !== "LOBBY" && (
        <div className="absolute inset-x-8 bottom-8 flex justify-between items-end pointer-events-none select-none z-10 transition-all duration-500">
          {/* Player 1 HUD (Bottom Left) */}
          <div className="manga-panel-sm p-4 bg-white dark:bg-black w-80 pointer-events-auto flex flex-col gap-2.5 shadow-[4px_4px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_rgba(255,255,255,1)] animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-black uppercase text-base tracking-tight">
                PLAYER: {playerName} <span className="text-[9px] bg-black dark:bg-white text-white dark:text-black px-1.5 py-0.5 font-bold ml-1">YOU</span>
              </span>
              <span className="text-xs font-black text-zinc-500">
                {health[playerName] ?? 5000} HP
              </span>
            </div>
            <div className="w-full h-6 border-2 border-black dark:border-white bg-zinc-100 dark:bg-zinc-950 relative overflow-hidden">
              <div 
                className="h-full bg-black dark:bg-white transition-all duration-300 ease-out" 
                style={{ width: `${Math.max(0, Math.min(100, ((health[playerName] ?? 5000) / 5000) * 100))}%` }}
              ></div>
            </div>
            {guessedCorrectly.includes(playerName) && (
              <span className="text-xs font-black uppercase text-white bg-black dark:text-black dark:bg-white py-1 px-3 self-start transform -rotate-1 mt-1.5">
                CORRECT!
              </span>
            )}
          </div>

          {/* Player 2 HUD (Bottom Right) */}
          {(() => {
            const oppName = players.find((p) => p !== playerName) || "Challenger";
            const hasOpponent = players.some((p) => p !== playerName);
            return (
              <div className="manga-panel-sm p-4 bg-white dark:bg-black w-80 pointer-events-auto flex flex-col gap-2.5 shadow-[4px_4px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_rgba(255,255,255,1)] animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-black uppercase text-base tracking-tight">
                    OPPONENT: {oppName}
                  </span>
                  <span className="text-xs font-black text-zinc-500">
                    {hasOpponent ? `${health[oppName] ?? 5000} HP` : "-- HP"}
                  </span>
                </div>
                <div className="w-full h-6 border-2 border-black dark:border-white bg-zinc-100 dark:bg-zinc-950 relative overflow-hidden">
                  <div 
                    className="h-full bg-black dark:bg-white transition-all duration-300 ease-out" 
                    style={{ width: `${hasOpponent ? Math.max(0, Math.min(100, ((health[oppName] ?? 5000) / 5000) * 100)) : 0}%` }}
                  ></div>
                </div>
                {hasOpponent && guessedCorrectly.includes(oppName) && (
                  <span className="text-xs font-black uppercase text-white bg-black dark:text-black dark:bg-white py-1 px-3 self-end transform rotate-1 mt-1.5">
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
