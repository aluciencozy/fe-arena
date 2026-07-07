import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gamepad2,
  ListChecks,
  ListX,
  Loader2,
  Lock,
  Play,
  Plus,
  Search,
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
  const [titleSearch, setTitleSearch] = useState("");
  const [isUsernameGateOpen, setIsUsernameGateOpen] = useState(
    savedUsername.trim().length === 0,
  );

  const trimmedUsername = username.trim();
  const hasUsername = !isUsernameGateOpen && trimmedUsername.length > 0;
  const canUseAnimeActions =
    hasUsername && selectedMode === "anime" && selectedTitleIds.length > 0 && !isQueueing;
  const canJoinRoom =
    hasUsername && roomId.trim().length > 0 && !isQueueing && !isCreating;

  const selectedTrackCount = useMemo(
    () =>
      animeTitles
        .filter((title) => selectedTitleIds.includes(title.id))
        .reduce((total, title) => total + title.tracks.length, 0),
    [selectedTitleIds],
  );
  const filteredAnimeTitles = useMemo(() => {
    const query = titleSearch.trim().toLowerCase();
    if (!query) return animeTitles;

    return animeTitles.filter((title) => {
      const searchableText = [
        title.name,
        title.canonicalTitle,
        title.romajiName,
        title.nativeName,
        ...title.answerAliases.map((alias) => alias.value),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [titleSearch]);
  const filteredSelectedCount = filteredAnimeTitles.filter((title) =>
    selectedTitleIds.includes(title.id),
  ).length;

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

  const normalizeRoomCodeInput = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

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

  const selectFilteredAnime = () => {
    setSelectedTitleIds((currentIds) =>
      Array.from(
        new Set([...currentIds, ...filteredAnimeTitles.map((title) => title.id)]),
      ),
    );
  };

  const deselectFilteredAnime = () => {
    const filteredIds = new Set(filteredAnimeTitles.map((title) => title.id));
    setSelectedTitleIds((currentIds) =>
      currentIds.filter((titleId) => !filteredIds.has(titleId)),
    );
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
    if (isCreating || isQueueing) return;

    const trimmedUsername = persistUsername();
    const normalizedRoomId = normalizeRoomCodeInput(roomId);
    if (!trimmedUsername || !normalizedRoomId) return;

    setNotice("");
    navigate(`/room/${normalizedRoomId}`);
  };

  const handleQueue = () => {
    if (isCreating || isQueueing) return;

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
      <div className="relative flex min-h-screen overflow-x-hidden bg-[#05070d] px-4 py-6 text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,_transparent_1px)] bg-[length:100%_4px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,_rgba(77,255,188,0.24),_transparent_28%),radial-gradient(circle_at_84%_22%,_rgba(255,77,77,0.2),_transparent_30%),linear-gradient(135deg,_rgba(77,255,188,0.08),_transparent_32%,_rgba(255,77,77,0.08))]" />
        <main className="relative z-10 mx-auto grid w-full max-w-5xl items-center gap-8 py-4 md:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 border border-player-1/50 bg-player-1/10 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-player-1">
              <Swords size={14} />
              Player login
            </div>
            <div>
              <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.35em] text-player-2">
                Real-time OST battles
              </p>
              <h1 className="max-w-3xl text-5xl font-black uppercase tracking-widest text-foreground text-player-1-glow sm:text-7xl lg:text-8xl">
                Guess The OST
              </h1>
            </div>
            <div className="grid max-w-2xl grid-cols-3 border border-border bg-card/50 text-center">
              {["Anime", "Versus", "Speed"].map((label) => (
                <div
                  key={label}
                  className="border-r border-border px-3 py-4 last:border-r-0"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Mode
                  </p>
                  <p className="mt-1 text-sm font-black uppercase tracking-widest text-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <form
            onSubmit={handleUsernameSubmit}
            className="gaming-card relative overflow-hidden border-player-1/50 bg-[#080a0f]/95 p-6 shadow-2xl shadow-player-1/10"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-player-1 via-foreground to-player-2" />
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  New challenger
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase tracking-widest">
                  Enter Name
                </h2>
              </div>
              <span className="flex size-11 items-center justify-center rounded-lg border border-player-1/50 bg-player-1/10 text-player-1">
                <Gamepad2 size={22} />
              </span>
            </div>
            <label
              htmlFor="startup-username"
              className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              Username
            </label>
            <Input
              id="startup-username"
              autoFocus
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (event.target.value.trim()) setNotice("");
              }}
              placeholder="xX_DemonSlayer_Xx"
              className="mb-4 h-12 border-player-1/40 bg-input text-lg font-black uppercase tracking-widest text-foreground placeholder:text-zinc-600"
              maxLength={18}
              aria-describedby={notice ? "startup-username-notice" : undefined}
            />
            <Button
              type="submit"
              disabled={trimmedUsername.length === 0}
              className="h-11 w-full bg-player-1 font-extrabold uppercase tracking-widest text-background hover:bg-player-1/90"
            >
              <Play size={16} />
              Press Enter
            </Button>
            {notice && (
              <div
                id="startup-username-notice"
                role="status"
                aria-live="polite"
                className="mt-4 border border-border bg-input px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                {notice}
              </div>
            )}
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(31,40,51,0.35)_0%,_rgba(11,15,25,1)_42%,_rgba(3,5,10,1)_100%)] px-4 py-6 text-foreground lg:h-screen lg:overflow-hidden">
      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-5 lg:h-full">
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
            aria-pressed={selectedMode === "anime"}
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
            aria-pressed={selectedMode === "video-game"}
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
          <div
            role="status"
            aria-live="polite"
            className="border border-border bg-input px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground"
          >
            {notice}
          </div>
        )}

        {selectedMode === "anime" && (
          <section className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex min-h-0 flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <h2 className="whitespace-nowrap text-xl font-black uppercase tracking-widest">
                    Anime Selection
                  </h2>
                  <p className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {selectedTitleIds.length} selected / {selectedTrackCount}{" "}
                    playable tracks
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {filteredSelectedCount} of {filteredAnimeTitles.length} shown selected
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 sm:w-64">
                    <label htmlFor="anime-title-search" className="sr-only">
                      Search anime titles
                    </label>
                    <Search
                      size={13}
                      className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="anime-title-search"
                      value={titleSearch}
                      onChange={(event) => setTitleSearch(event.target.value)}
                      placeholder="SEARCH ANIME"
                      className="h-8 bg-input pl-8 text-[10px] font-black uppercase tracking-widest text-foreground placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={selectFilteredAnime}
                      disabled={filteredAnimeTitles.length === 0}
                      size="sm"
                      className="h-8 px-2 text-[10px] font-extrabold uppercase tracking-wider"
                    >
                      <ListChecks size={13} />
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={deselectFilteredAnime}
                      disabled={filteredAnimeTitles.length === 0}
                      size="sm"
                      className="h-8 px-2 text-[10px] font-extrabold uppercase tracking-wider"
                    >
                      <ListX size={13} />
                      Clear
                    </Button>
                  </div>
                </div>
              </div>

              <div className="anime-picker-scroll min-h-0 flex-1 overflow-y-auto pr-2">
                <div className="grid gap-3">
                {filteredAnimeTitles.map((title) => {
                  const selected = selectedTitleIds.includes(title.id);
                  return (
                    <button
                      key={title.id}
                      type="button"
                      onClick={() => toggleAnime(title.id)}
                      aria-pressed={selected}
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
                {filteredAnimeTitles.length === 0 && (
                  <div className="border border-border bg-input px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    No anime matched your search.
                  </div>
                )}
                </div>
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
                <label htmlFor="room-code" className="sr-only">
                  Room code
                </label>
                <Input
                  id="room-code"
                  value={roomId}
                  onChange={(event) =>
                    setRoomId(normalizeRoomCodeInput(event.target.value))
                  }
                  placeholder="ROOM CODE"
                  className="mb-3 bg-input text-center font-black uppercase tracking-widest text-foreground placeholder:text-zinc-600"
                  maxLength={6}
                />
                <Button
                  type="submit"
                  disabled={!canJoinRoom}
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
                      username.trim().length === 0 ||
                      selectedMode !== "anime" ||
                      isCreating
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
