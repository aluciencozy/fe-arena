import { useGameStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";

const Room = () => {
  // Access the player's name from the global game store to display it in the room
  const playerName = useGameStore((state) => state.playerName);

  const { serverMessage } = useSocket(); // Get the message from the WebSocket server

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
      <h1 className="text-3xl font-bold text-zinc-400">Hi {playerName}!</h1>
      <p>{serverMessage}</p>
    </div>
  );
}

export default Room