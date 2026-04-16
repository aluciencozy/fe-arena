import { useGameStore } from "@/store/gameStore";

const Room = () => {
  // Access the player's name from the global game store to display it in the room
  const playerName = useGameStore((state) => state.playerName);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
      <h1 className="text-3xl font-bold text-zinc-400">Hi {playerName}!</h1>
    </div>
  );
}

export default Room