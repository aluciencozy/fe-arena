import { useParams, useNavigate } from "react-router-dom";
import YouTube, { type YouTubeEvent } from "react-youtube";
import { useGameStore, useGameStateStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";
import ChatBox from "@/components/game/ChatBox";

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
  const health = useGameStateStore((state) => state.health);

  // Use the custom hook to manage WebSocket connections and game state synchronization by grabbed the necessary data and functions for the room
  const { players, messages, sendChatMessage, startGame } = useSocket(
    dynamicRoomId,
    playerName,
  );

  const opponent = players.find((p) => p !== playerName);
  const opponentName = opponent ? opponent : "Waiting for opponent...";

  const handlePlayerReady = (event: YouTubeEvent) => {
    if (!roundStartTime) return; // Ensure round start time is set before calculating elapsed time

    const elapsedTime = (Date.now() - roundStartTime) / 1000; // Calculate elapsed time in seconds
    const syncTime = videoStartTime + elapsedTime; // Calculate the time to sync the video to

    event.target.seekTo(syncTime, true); // Seek the video to the calculated sync time
    event.target.playVideo(); // Start playing the video
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden p-4 gap-4">
      {/* LEFT COLUMN: Main Game Area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Header */}
        <header className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <h1 className="text-2xl font-bold text-zinc-100">Room: {dynamicRoomId}</h1>
          <span className="text-zinc-400">
            Playing as:{" "}
            <span className="text-emerald-400 font-semibold">{playerName}</span>
          </span>
        </header>

        {/* Example layout, adjust to your exact variables */}
        <div className="flex justify-between w-full px-8 py-4 bg-zinc-900 text-white">
          <div className="flex flex-col items-start">
            <span className="font-bold text-blue-400">{playerName}</span>
            <span className="text-2xl">{health[playerName]} HP</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-bold text-red-400">{opponentName}</span>
            <span className="text-2xl">{health[opponentName]} HP</span>
          </div>
        </div>

        {/* Audio/Video Stage */}
        <main className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center">
          {(phase === "PLAYING" || phase === "GRACE_PERIOD") && currentVideoId ? (
            <div className="w-full overflow-hidden flex flex-col items-center justify-center relative">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 w-full h-full flex justify-center items-center">
                Listening...
              </div>
              <YouTube
                videoId={currentVideoId}
                opts={{
                  width: "100%",
                  height: "100%",
                  playerVars: {
                    controls: 0, // Hide player controls
                    disablekb: 1, // Disable keyboard controls
                    modestbranding: 1, // Hide YouTube logo
                    iv_load_policy: 3, // Hide video annotations
                    fs: 0, // Disable fullscreen
                    rel: 0, // Don't show related videos at the end
                    // autoplay: 0, // This will be handled manually in the future
                  },
                }}
                onReady={handlePlayerReady}
                className="overflow-hidden aspect-video w-full opacity-0 pointer-events-none"
              />
            </div>
          ) : (
            <div className="text-center text-zinc-500">
              <h2 className="text-3xl font-bold mb-2">Waiting to start...</h2>
            </div>
          )}

          {phase === "ROUND_END" && (
            <div className="absolute inset-0 bg-zinc-900/90 flex flex-col items-center justify-center gap-4">
              <h2 className="text-4xl font-bold text-emerald-400">
                Round Over! Next song starting soon...
              </h2>
              <div className="flex gap-8">
                <div className="text-center">
                  <span className="text-lg font-bold">{playerName}</span>
                  <p className="text-2xl">{health[playerName]}</p>
                </div>
                <div className="text-center">
                  <span className="text-lg font-bold">{opponentName}</span>
                  <p className="text-2xl">{health[opponentName]}</p>
                </div>
              </div>
            </div>
          )}

          {phase === "GAME_OVER" && (
            <div className="absolute inset-0 bg-zinc-900/90 flex flex-col items-center justify-center gap-4">
              <h2 className="text-4xl font-bold text-emerald-400">
                {health[playerName] > health[opponentName] ? "You Win!" : "You Lose!"}
              </h2>
              <div className="flex gap-8">
                <div className="text-center">
                  <span className="text-lg font-bold">{playerName}</span>
                  <p className="text-2xl">{health[playerName]}</p>
                </div>
                <div className="text-center">
                  <span className="text-lg font-bold">{opponentName}</span>
                  <p className="text-2xl">{health[opponentName]}</p>
                </div>
              </div>
              <button
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-xl transition-colors"
                onClick={startGame}
              >
                Play Again
              </button>
            </div>
          )}
        </main>
      </div>

      {/* RIGHT COLUMN: Social Sidebar */}
      <div className="w-80 flex flex-col gap-4">
        {/* Player Roster */}
        <div className="h-1/3 bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex flex-col">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">
            Players ({players.length})
          </h2>
          <ul className="overflow-y-auto flex-1 space-y-2">
            {players.map((player) => (
              <li key={player} className="flex items-center gap-2 text-zinc-300">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                {player}
              </li>
            ))}
          </ul>
        </div>

        {/* Game Start Button */}
        {phase === "LOBBY" && (
          <button
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-xl transition-colors"
            onClick={() => {
              // Emit the game:start event
              startGame();
            }}
          >
            Start Game
          </button>
        )}

        {/* Chat Box */}
        <div className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col overflow-hidden">
          <div className="bg-zinc-950/50 p-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">
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
