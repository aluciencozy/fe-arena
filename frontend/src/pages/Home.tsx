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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(11,15,25,1)_0%,_rgba(3,5,10,1)_100%)] p-4">
      <div className="w-full max-w-md p-8 gaming-card shadow-2xl transition-all duration-500 hover:border-player-1/40 relative overflow-hidden group">
        
        {/* Subtle accent border top line */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-player-1 to-cyan-400 opacity-80"></div>
        
        <div className="mb-8 text-center relative z-10">
          <h1 className="mb-2 text-4xl font-extrabold tracking-widest bg-gradient-to-r from-player-1 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(77,255,188,0.25)]">
            GUESS THE OST
          </h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/80">
            Enter a room code to join the game.
          </p>
        </div>

        <form onSubmit={handleJoinRoom} className="space-y-5 relative z-10">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label>
            <Input
              type="text"
              placeholder="xX_DemonSlayer_Xx"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-input border-border/80 focus-visible:border-player-1 focus-visible:ring-player-1/25 placeholder:text-zinc-600 rounded-lg text-sm text-foreground"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Room Code</label>
            <Input
              type="text"
              placeholder="ABCD"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="bg-input border-border/80 focus-visible:border-player-1 focus-visible:ring-player-1/25 placeholder:text-zinc-600 rounded-lg text-sm text-foreground uppercase"
              maxLength={6}
            />
          </div>

          <Button
            type="submit"
            className="w-full font-extrabold uppercase tracking-widest text-xs py-5 rounded-lg bg-player-1 text-background hover:bg-player-1/90 transition-all shadow-[0_0_15px_rgba(77,255,188,0.25)] hover:shadow-[0_0_25px_rgba(77,255,188,0.45)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
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
