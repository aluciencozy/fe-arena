import { useGameStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";

const Room = () => {
  // Access the player's name from the global game store to display it in the room
  const playerName = useGameStore((state) => state.playerName);

  // Get the notifications from the useSocket hook, which listens for room events from the server
  const { notifications } = useSocket("default-room", playerName); 

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-zinc-950 text-white">
      <h1 className="text-3xl font-bold text-zinc-400">Hi {playerName}!</h1>
      <ul className="text-zinc-400">{notifications.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
    </div>
  );
}

export default Room