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

  // Use the custom hook to manage WebSocket connections and game state synchronization by grabbed the necessary data and functions for the room
  const { players, messages, sendChatMessage, startGame } = useSocket(
    dynamicRoomId,
    playerName,
  );

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
          <h1 className="text-2xl font-bold text-zinc-100">
            Room: {dynamicRoomId}
          </h1>
          <span className="text-zinc-400">
            Playing as:{" "}
            <span className="text-emerald-400 font-semibold">{playerName}</span>
          </span>
        </header>

        {/* Audio/Video Stage */}
        <main className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center">
          {phase === "PLAYING" && currentVideoId ? (
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
            <div className="text-center text-zinc-500">
              <h2 className="text-3xl font-bold mb-2">Waiting to start...</h2>
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
              <li
                key={player}
                className="flex items-center gap-2 text-zinc-300"
              >
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
