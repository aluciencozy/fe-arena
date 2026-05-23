import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useGameStore } from "@/store/gameStore";

const Home = () => {
  // Local state to hold the username and room ID input values
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");

  // Access the setPlayerName function from the global game store to save the player's name
  const setPlayerName = useGameStore((state) => state.setPlayerName);

  // Hook to programmatically navigate to different routes
  const navigate = useNavigate();

  // Handler for when the user submits the form to join a room
  const handleJoinRoom = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent page reload on form submission

    // Ensure both fields are filled out before navigating
    if (!username.trim() || !roomId.trim()) return;

    // Save username to global store
    setPlayerName(username.trim());

    // Navigate to the Room page injecting the room ID into the URL
    navigate(`/room/${roomId.toUpperCase()}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card/90 p-8 shadow-xl backdrop-blur-sm">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-black tracking-tight text-foreground">
            GUESS THE OST
          </h1>
          <p className="text-muted-foreground">
            Enter a room code to join the game.
          </p>
        </div>

        <form onSubmit={handleJoinRoom} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Username</label>
            <Input
              type="text"
              placeholder="xX_DemonSlayer_Xx"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Room Code</label>
            <Input
              type="text"
              placeholder="ABCD"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="bg-background uppercase"
              maxLength={6}
            />
          </div>

          <Button
            type="submit"
            className="w-full font-bold"
            size="lg"
            disabled={!username.trim() || !roomId.trim()}
          >
            Join Lobby
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Home;
