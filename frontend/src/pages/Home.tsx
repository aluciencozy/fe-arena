import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gamepad2,
  Loader2,
  Lock,
  Play,
  Plus,
  Swords,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { animeTitles } from "@/data/catalog";
import { socket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";
import type { GameMode, RoomMetadata } from "@/types";

const Home = () => {
  const navigate = useNavigate();
  const savedUsername = useGameStore((state) => state.playerName);
  const setPlayerName = useGameStore((state) => state.setPlayerName);

  const [username, setUsername] = useState(savedUsername);
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [selectedTitleIds, setSelectedTitleIds] = useState<string[]>([
    animeTitles[0]?.id ?? "",
  ].filter(Boolean));
  const [roomId, setRoomId] = useState("");
  const [notice, setNotice] = useState("");
  const [isQueueing, setIsQueueing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const canUseAnimeActions =
    username.trim().length > 0 &&
    selectedMode === "anime" &&
    selectedTitleIds.length > 0 &&
    !isQueueing;
  const canJoinRoom = username.trim().length > 0 && roomId.trim().length > 0;

  const selectedTrackCount = useMemo(
    () =>
      animeTitles
        .filter((title) => selectedTitleIds.includes(title.id))
        .reduce((total, title) => total + title.tracks.length, 0),
    [selectedTitleIds],
  );

  useEffect(() => {
    const handleRoomCreated = (metadata: RoomMetadata) => {
      setIsCreating(false);
      setPlayerName(username.trim());
      navigate(`/room/${metadata.roomId}`);
    };

    const handleQueueWaiting = () => {
      setIsQueueing(true);
      setNotice("Searching for another player...");
    };

    const handleQueueMatched = (metadata: RoomMetadata) => {
      setIsQueueing(false);
      setPlayerName(username.trim());
      navigate(`/room/${metadata.roomId}`);
    };

    const handleQueueCancelled = () => {
      setIsQueueing(false);
      setNotice("Queue cancelled.");
    };

    const handleError = (message: string) => {
      setIsCreating(false);
      setIsQueueing(false);
      setNotice(message);
    };

    socket.on("room:created", handleRoomCreated);
    socket.on("room:error", handleError);
    socket.on("queue:waiting", handleQueueWaiting);
    socket.on("queue:matched", handleQueueMatched);
    socket.on("queue:cancelled", handleQueueCancelled);
    socket.on("queue:error", handleError);

    return () => {
      socket.off("room:created", handleRoomCreated);
      socket.off("room:error", handleError);
      socket.off("queue:waiting", handleQueueWaiting);
      socket.off("queue:matched", handleQueueMatched);
      socket.off("queue:cancelled", handleQueueCancelled);
      socket.off("queue:error", handleError);
    };
  }, [navigate, setPlayerName, username]);

  const persistUsername = () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setNotice("Choose a username first.");
      return null;
    }

    setPlayerName(trimmedUsername);
    return trimmedUsername;
  };

  const handleModeSelect = (mode: GameMode) => {
    if (mode === "video-game") {
      setSelectedMode(null);
      setNotice("Video game OST mode is under development for a future release.");
      return;
    }

    setSelectedMode(mode);
    setNotice("");
  };

  const toggleAnime = (titleId: string) => {
    setSelectedTitleIds((currentIds) => {
      if (currentIds.includes(titleId)) {
        return currentIds.filter((id) => id !== titleId);
      }

      return [...currentIds, titleId];
    });
  };

  const handleCreateLobby = () => {
    const trimmedUsername = persistUsername();
    if (!trimmedUsername || selectedMode !== "anime") return;

    if (selectedTitleIds.length === 0) {
      setNotice("Select at least one anime.");
      return;
    }

    setIsCreating(true);
    setNotice("");
    socket.connect();
    socket.emit("room:create-private", {
      username: trimmedUsername,
      mode: selectedMode,
      selectedTitleIds,
    });
  };

  const handleJoinRoom = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUsername = persistUsername();
    if (!trimmedUsername || !roomId.trim()) return;

    setNotice("");
    navigate(`/room/${roomId.trim().toUpperCase()}`);
  };

  const handleQueue = () => {
    const trimmedUsername = persistUsername();
    if (!trimmedUsername || selectedMode !== "anime") return;

    setNotice("");
    setIsQueueing(true);
    socket.connect();
    socket.emit("queue:join", {
      username: trimmedUsername,
      mode: selectedMode,
    });
  };

  const handleCancelQueue = () => {
    socket.emit("queue:cancel");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(31,40,51,0.35)_0%,_rgba(11,15,25,1)_42%,_rgba(3,5,10,1)_100%)] px-4 py-8 text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-player-1">
              Real-time OST battles
            </p>
            <h1 className="text-4xl font-black uppercase tracking-widest text-foreground md:text-6xl">
              Guess The OST
            </h1>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Username
            </label>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="xX_DemonSlayer_Xx"
              className="bg-input text-foreground placeholder:text-zinc-600"
              maxLength={18}
            />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => handleModeSelect("anime")}
            className={`gaming-card group flex min-h-44 flex-col items-start justify-between p-5 text-left transition-all hover:border-player-1/70 ${
              selectedMode === "anime" ? "player-1-border-glow" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg border border-player-1/50 bg-player-1/10 text-player-1">
                <Swords size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest">
                  Anime
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Available now
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm font-semibold text-zinc-300">
              Choose anime titles for private rooms or queue into the full anime
              OST pool.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect("video-game")}
            className="gaming-card group flex min-h-44 flex-col items-start justify-between p-5 text-left opacity-75 transition-all hover:border-player-2/70"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg border border-player-2/50 bg-player-2/10 text-player-2">
                <Gamepad2 size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest">
                  Video Game
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Under development
                </p>
              </div>
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-zinc-400">
              <Lock size={16} /> This section is under development.
            </p>
          </button>
        </section>

        {notice && (
          <div className="border border-border bg-input px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {notice}
          </div>
        )}

        {selectedMode === "anime" && (
          <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest">
                    Anime Selection
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {selectedTitleIds.length} selected / {selectedTrackCount}{" "}
                    playable tracks
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {animeTitles.map((title) => {
                  const selected = selectedTitleIds.includes(title.id);
                  return (
                    <button
                      key={title.id}
                      type="button"
                      onClick={() => toggleAnime(title.id)}
                      className={`group overflow-hidden border bg-card text-left shadow-xl transition-all hover:border-player-1/70 ${
                        selected
                          ? "border-player-1 shadow-[0_0_18px_var(--player-1-glow)]"
                          : "border-border"
                      }`}
                    >
                      <div className="aspect-[16/9] w-full overflow-hidden bg-input">
                        <img
                          src={title.coverImageUrl}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 p-4">
                        <div>
                          <h3 className="text-lg font-black uppercase tracking-wide">
                            {title.name}
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {title.tracks.length} OST entry
                            {title.tracks.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span
                          className={`flex size-7 items-center justify-center rounded border text-xs font-black ${
                            selected
                              ? "border-player-1 bg-player-1 text-background"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {selected ? "ON" : ""}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="gaming-card p-5">
                <div className="mb-4 flex items-center gap-2 text-player-1">
                  <Plus size={18} />
                  <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                    Private Lobby
                  </h2>
                </div>
                <p className="mb-4 text-xs font-semibold text-muted-foreground">
                  Create a generated room code using your anime picks. Share the
                  code with a friend.
                </p>
                <Button
                  type="button"
                  onClick={handleCreateLobby}
                  disabled={!canUseAnimeActions || isCreating}
                  className="w-full bg-player-1 font-extrabold uppercase tracking-widest text-background hover:bg-player-1/90"
                >
                  {isCreating ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  Create Lobby
                </Button>
              </div>

              <form onSubmit={handleJoinRoom} className="gaming-card p-5">
                <div className="mb-4 flex items-center gap-2 text-player-2">
                  <Users size={18} />
                  <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                    Join Friend
                  </h2>
                </div>
                <Input
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  placeholder="ROOM CODE"
                  className="mb-3 bg-input text-center font-black uppercase tracking-widest text-foreground placeholder:text-zinc-600"
                  maxLength={6}
                />
                <Button
                  type="submit"
                  disabled={!canJoinRoom || isQueueing}
                  variant="outline"
                  className="w-full font-extrabold uppercase tracking-widest"
                >
                  <Play size={16} />
                  Join Lobby
                </Button>
              </form>

              <div className="gaming-card p-5">
                <div className="mb-4 flex items-center gap-2 text-player-1">
                  <Swords size={18} />
                  <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                    Public Queue
                  </h2>
                </div>
                <p className="mb-4 text-xs font-semibold text-muted-foreground">
                  Queue for a live opponent using all anime songs.
                </p>
                {isQueueing ? (
                  <Button
                    type="button"
                    onClick={handleCancelQueue}
                    variant="outline"
                    className="w-full font-extrabold uppercase tracking-widest"
                  >
                    <X size={16} />
                    Cancel Queue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleQueue}
                    disabled={
                      username.trim().length === 0 || selectedMode !== "anime"
                    }
                    className="w-full bg-player-2 font-extrabold uppercase tracking-widest text-background hover:bg-player-2/90"
                  >
                    <Swords size={16} />
                    Queue
                  </Button>
                )}
              </div>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
};

export default Home;
