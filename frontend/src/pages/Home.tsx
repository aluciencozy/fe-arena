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
import { connectSocket, socket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";
import type { GameMode, RoomMetadata } from "@/types";

const Home = () => {
  const navigate = useNavigate();
  const savedUsername = useGameStore((state) => state.playerName);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const animeModeImages = animeTitles
    .slice(0, 3)
    .map((title) => title.coverImageUrl);
  const videoGameModeImages = [
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=900&q=80",
  ];

  const [username, setUsername] = useState(savedUsername);
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [selectedTitleIds, setSelectedTitleIds] = useState<string[]>([
    animeTitles[0]?.id ?? "",
  ].filter(Boolean));
  const [roomId, setRoomId] = useState("");
  const [notice, setNotice] = useState("");
  const [isQueueing, setIsQueueing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUsernameGateOpen, setIsUsernameGateOpen] = useState(
    savedUsername.trim().length === 0,
  );

  const trimmedUsername = username.trim();
  const hasUsername = !isUsernameGateOpen && trimmedUsername.length > 0;
  const canUseAnimeActions =
    hasUsername && selectedMode === "anime" && selectedTitleIds.length > 0 && !isQueueing;
  const canJoinRoom = hasUsername && roomId.trim().length > 0;

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
    if (!trimmedUsername) {
      setNotice("Choose a username first.");
      return null;
    }

    setPlayerName(trimmedUsername);
    return trimmedUsername;
  };

  const handleUsernameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const persistedUsername = persistUsername();
    if (!persistedUsername) return;

    setUsername(persistedUsername);
    setIsUsernameGateOpen(false);
    setNotice("");
  };

  const handleModeSelect = (mode: GameMode) => {
    if (!hasUsername) {
      setSelectedMode(null);
      setNotice("Choose a username first.");
      return;
    }

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
    connectSocket();
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
    connectSocket();
    socket.emit("queue:join", {
      username: trimmedUsername,
      mode: selectedMode,
    });
  };

  const handleCancelQueue = () => {
    socket.emit("queue:cancel");
  };

  if (isUsernameGateOpen) {
    return (
      <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(31,40,51,0.35)_0%,_rgba(11,15,25,1)_42%,_rgba(3,5,10,1)_100%)] px-4 py-8 text-foreground">
        <main className="mx-auto flex w-full max-w-md flex-col justify-center">
          <form
            onSubmit={handleUsernameSubmit}
            className="gaming-card p-6 shadow-2xl"
          >
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-player-1">
              Real-time OST battles
            </p>
            <h1 className="mb-6 text-4xl font-black uppercase tracking-widest text-foreground">
              Guess The OST
            </h1>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Username
            </label>
            <Input
              autoFocus
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (event.target.value.trim()) setNotice("");
              }}
              placeholder="xX_DemonSlayer_Xx"
              className="mb-4 bg-input text-foreground placeholder:text-zinc-600"
              maxLength={18}
            />
            <Button
              type="submit"
              disabled={trimmedUsername.length === 0}
              className="w-full bg-player-1 font-extrabold uppercase tracking-widest text-background hover:bg-player-1/90"
            >
              Continue
            </Button>
            {notice && (
              <div className="mt-4 border border-border bg-input px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {notice}
              </div>
            )}
          </form>
        </main>
      </div>
    );
  }

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
          <div className="flex w-full max-w-sm items-center justify-between gap-3 border border-border bg-card/70 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Username
              </p>
              <p className="truncate text-sm font-black uppercase tracking-widest text-foreground">
                {trimmedUsername}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsUsernameGateOpen(true)}
              disabled={isQueueing || isCreating}
              className="font-extrabold uppercase tracking-widest"
            >
              Change
            </Button>
          </div>
        </header>

        <section className="grid gap-3">
          <button
            type="button"
            onClick={() => handleModeSelect("anime")}
            className={`home-row group relative flex min-h-28 items-center justify-between overflow-hidden px-5 py-4 text-left transition-all hover:border-player-1/70 ${
              selectedMode === "anime" ? "player-1-border-glow" : ""
            }`}
          >
            <div className="relative z-10 flex items-center gap-4">
              <span className="flex size-11 items-center justify-center rounded-lg border border-player-1/50 bg-player-1/10 text-player-1">
                <Swords size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-foreground md:text-3xl">
                  Anime
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Available now / full catalog queue
                </p>
              </div>
            </div>
            <p className="relative z-10 hidden max-w-sm text-right text-sm font-semibold text-zinc-300 md:block">
              Choose title pools for private rooms or queue into the full anime OST set.
            </p>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex w-3/5 justify-end opacity-70">
              {animeModeImages.map((imageUrl, index) => (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-32 object-cover opacity-80 transition-transform duration-500 group-hover:scale-105 md:w-44"
                  style={{ transform: `translateX(${index * 18}px)` }}
                />
              ))}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect("video-game")}
            className="home-row group relative flex min-h-28 items-center justify-between overflow-hidden px-5 py-4 text-left opacity-75 transition-all hover:border-player-2/70"
          >
            <div className="relative z-10 flex items-center gap-4">
              <span className="flex size-11 items-center justify-center rounded-lg border border-player-2/50 bg-player-2/10 text-player-2">
                <Gamepad2 size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-foreground md:text-3xl">
                  Video Game
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Under development
                </p>
              </div>
            </div>
            <p className="relative z-10 hidden items-center gap-2 text-sm font-semibold text-zinc-400 md:flex">
              <Lock size={16} /> This section is under development.
            </p>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-3/5 opacity-55">
              {videoGameModeImages.map((imageUrl) => (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="ml-auto h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ))}
            </div>
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

              <div className="grid gap-3">
                {animeTitles.map((title) => {
                  const selected = selectedTitleIds.includes(title.id);
                  return (
                    <button
                      key={title.id}
                      type="button"
                      onClick={() => toggleAnime(title.id)}
                      className={`home-row group relative min-h-24 overflow-hidden px-4 py-3 text-left transition-all hover:border-player-1/70 ${
                        selected ? "player-1-border-glow" : ""
                      }`}
                    >
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-3/5 opacity-65">
                        <img
                          src={title.coverImageUrl}
                          alt=""
                          aria-hidden="true"
                          className="ml-auto h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3">
                        <div className="max-w-[72%]">
                          <h3 className="text-base font-black uppercase tracking-wide text-foreground md:text-lg">
                            {title.name}
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {title.tracks.length} OST{" "}
                            {title.tracks.length === 1 ? "entry" : "entries"}
                          </p>
                        </div>
                        <span
                          className={`flex size-7 items-center justify-center rounded border text-xs font-black ${
                            selected
                              ? "border-player-1 bg-player-1 text-background"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {selected ? "ON" : " "}
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
