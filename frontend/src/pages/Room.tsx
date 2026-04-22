import { useGameStore } from "@/store/gameStore";
import { useSocket } from "@/hooks/useSocket";
import ChatBox from "@/components/game/ChatBox";

const Room = () => {
  // Access the player's name from the global game store to display it in the room
  const playerName = useGameStore((state) => state.playerName);

  // Get the notifications from the useSocket hook, which listens for room events from the server
  const { notifications, players, chatMessages, sendChatMessage } = useSocket(
    "default-room",
    playerName,
  );

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-zinc-950 text-white">
      <h1 className="text-3xl font-bold text-zinc-400">Hi {playerName}!</h1>
      <ChatBox chatMessages={chatMessages} sendChatMessage={sendChatMessage} />
      <ul className="text-zinc-400">
        {notifications.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
      <br />
      <div className="flex flex-col justify-center items-center gap-3">
        <h2>Players</h2>
        <ul>
          {players.map((player) => (
            <li key={player}>{player}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Room;
