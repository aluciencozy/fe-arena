import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube, { type YouTubeEvent } from "react-youtube";
import { useGameStore, useGameStateStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";
import ChatBox from "@/components/game/ChatBox";
import { Button } from "@/components/ui/button";

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

  // Use the custom hook to manage WebSocket connections and game state synchronization by grabbed the necessary data and functions for the room
  const { players, messages, sendChatMessage, setReady } = useSocket(
    dynamicRoomId,
    playerName,
  );
  const [now, setNow] = useState(Date.now());
  const hasActiveTimer = countdownEndsAt !== null || roundEndsAt !== null;

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
  const canReady =
    (phase === "LOBBY" || phase === "GAME_OVER") &&
    players.length === 2 &&
    !ready[playerName];
  const readyButtonLabel = useMemo(() => {
    if (players.length < 2) return "Waiting for opponent";
    if (ready[playerName]) return "Ready";
    return phase === "GAME_OVER" ? "Ready for Rematch" : "Ready Up";
  }, [phase, playerName, players.length, ready]);

  const handlePlayerReady = (event: YouTubeEvent) => {
    if (!roundStartTime) return; // Ensure round start time is set before calculating elapsed time

    const elapsedTime = (Date.now() - roundStartTime) / 1000; // Calculate elapsed time in seconds
    const syncTime = videoStartTime + elapsedTime; // Calculate the time to sync the video to

    event.target.seekTo(syncTime, true); // Seek the video to the calculated sync time
    event.target.playVideo(); // Start playing the video
  };

  return (
    <div className="flex h-screen overflow-hidden gap-4 p-4 text-foreground">
      {/* LEFT COLUMN: Main Game Area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Header */}
        <header className="flex items-center justify-between rounded-lg border bg-card/90 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-foreground">
            Room: {dynamicRoomId}
          </h1>
          <span className="text-muted-foreground">
            Playing as:{" "}
            <span className="font-semibold text-primary">{playerName}</span>
          </span>
        </header>

        <section className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card/90 p-3">
            <p className="text-xs uppercase text-muted-foreground">Phase</p>
            <p className="text-lg font-semibold">{phase.replace("_", " ")}</p>
          </div>
          <div className="rounded-lg border bg-card/90 p-3">
            <p className="text-xs uppercase text-muted-foreground">Round</p>
            <p className="text-lg font-semibold">{currentRound + 1}</p>
          </div>
          <div className="rounded-lg border bg-card/90 p-3">
            <p className="text-xs uppercase text-muted-foreground">Countdown</p>
            <p className="text-lg font-semibold">
              {countdownSeconds ?? "--"}
            </p>
          </div>
          <div className="rounded-lg border bg-card/90 p-3">
            <p className="text-xs uppercase text-muted-foreground">Timer</p>
            <p className="text-lg font-semibold">{roundSeconds ?? "--"}</p>
          </div>
        </section>

        {/* Audio/Video Stage */}
        <main className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border bg-card/90">
          {(phase === "PLAYING" || phase === "GRACE_PERIOD") &&
          currentVideoId ? (
            <YouTube
              videoId={currentVideoId} // Fallback video ID
              opts={{
                width: "100%",
                height: "100%",
              }}
              onReady={handlePlayerReady}
              className="overflow-hidden aspect-video w-full"
            />
          ) : (
            <div className="px-6 text-center text-muted-foreground">
              <h2 className="mb-2 text-3xl font-bold text-foreground">
                {phase === "COUNTDOWN"
                  ? `Starting in ${countdownSeconds ?? 0}`
                  : phase === "REVEAL"
                    ? "Answer revealed"
                    : phase === "GAME_OVER"
                      ? "Game over"
                      : "Waiting to start..."}
              </h2>
              {revealedAnswer && (
                <p className="text-lg text-primary">
                  Answer: {revealedAnswer}
                </p>
              )}
              {winner && (
                <p className="text-lg text-primary">Winner: {winner}</p>
              )}
            </div>
          )}
        </main>
      </div>

      {/* RIGHT COLUMN: Social Sidebar */}
      <div className="w-80 flex flex-col gap-4">
        {/* Player Roster */}
        <div className="flex h-1/3 flex-col rounded-lg border bg-card/90 p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Players ({players.length})
          </h2>
          <ul className="overflow-y-auto flex-1 space-y-2">
            {players.map((player) => (
              <li
                key={player}
                className="flex items-center justify-between gap-2 text-foreground"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary"></span>
                  {player}
                </span>
                <span className="text-xs text-muted-foreground">
                  {health[player] ?? 5000} HP
                </span>
                <span
                  className={`text-xs font-semibold ${
                    ready[player] ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {ready[player] ? "Ready" : "Not Ready"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {(phase === "LOBBY" || phase === "GAME_OVER") && (
          <Button
            disabled={!canReady}
            size="lg"
            className="w-full font-bold"
            onClick={() => {
              setReady();
            }}
          >
            {readyButtonLabel}
          </Button>
        )}

        {/* Chat Box */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card/90">
          <div className="border-b bg-muted/40 p-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Live Chat
            </h2>
          </div>
          {/* I wrapped your ChatBox in a flex-1 container so it fills the remaining height */}
          <div className="flex-1 p-2">
            <ChatBox messages={messages} onSendMessage={sendChatMessage} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
