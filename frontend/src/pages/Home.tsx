import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Gamepad2,
  Loader2,
  LogIn,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { AppSettings } from "@/components/AppSettings";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { animeTitles, getTracksForPlaylist } from "@/data/catalog";
import { playSound } from "@/lib/sound";
import { connectSocket, socket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";
import { getAnimePlaylistLabel } from "../../../shared/playlist";
import type { AnimePlaylist, RoomMetadata } from "@/types";

type HomeView = "play" | "create" | "join" | "queue";

const normalizeRoomCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const savedUsername = useGameStore((state) => state.playerName);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const [username, setUsername] = useState(savedUsername);
  const [view, setView] = useState<HomeView>("play");
  const [roomId, setRoomId] = useState("");
  const [titleSearch, setTitleSearch] = useState("");
  const [selectedTitleIds, setSelectedTitleIds] = useState<string[]>([
    animeTitles[0]?.id ?? "",
  ].filter(Boolean));
  const [playlist, setPlaylist] = useState<AnimePlaylist>("standard");
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice ?? "",
  );
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [queueStartedAt, setQueueStartedAt] = useState<number | null>(null);
  const [queueSeconds, setQueueSeconds] = useState(0);

  const trimmedUsername = username.trim();
  const availableTitles = useMemo(
    () =>
      animeTitles.filter(
        (title) => getTracksForPlaylist(title, playlist).length > 0,
      ),
    [playlist],
  );
  const selectedTitleIdsForPlaylist = useMemo(() => {
    const availableIds = new Set(availableTitles.map((title) => title.id));
    return selectedTitleIds.filter((titleId) => availableIds.has(titleId));
  }, [availableTitles, selectedTitleIds]);
  const filteredTitles = useMemo(() => {
    const query = titleSearch.trim().toLowerCase();
    if (!query) return availableTitles;
    return availableTitles.filter((title) =>
      [
        title.name,
        title.canonicalTitle,
        title.romajiName,
        title.nativeName,
        ...title.answerAliases.map((alias) => alias.value),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [availableTitles, titleSearch]);
  const selectedTrackCount = useMemo(
    () =>
      availableTitles
        .filter((title) => selectedTitleIds.includes(title.id))
        .reduce(
          (sum, title) => sum + getTracksForPlaylist(title, playlist).length,
          0,
        ),
    [availableTitles, playlist, selectedTitleIds],
  );

  useEffect(() => {
    if (!location.state) return;
    navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!queueStartedAt) return;
    const update = () => setQueueSeconds(Math.floor((Date.now() - queueStartedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [queueStartedAt]);

  useEffect(() => {
    const roomCreated = (metadata: RoomMetadata) => {
      setIsCreating(false);
      setPlayerName(trimmedUsername);
      playSound("confirm");
      navigate(`/room/${metadata.roomId}`);
    };
    const queueWaiting = () => {
      setView("queue");
      setQueueStartedAt(Date.now());
    };
    const queueMatched = (metadata: RoomMetadata) => {
      setPlayerName(trimmedUsername);
      playSound("confirm");
      navigate(`/room/${metadata.roomId}`);
    };
    const queueCancelled = () => {
      setQueueStartedAt(null);
      setView("play");
      setToast("Matchmaking cancelled.");
    };
    const error = (message: string) => {
      setIsCreating(false);
      setQueueStartedAt(null);
      setView((current) => (current === "queue" ? "play" : current));
      setNotice(message);
      playSound("incorrect");
    };
    socket.on("room:created", roomCreated);
    socket.on("room:error", error);
    socket.on("queue:waiting", queueWaiting);
    socket.on("queue:matched", queueMatched);
    socket.on("queue:cancelled", queueCancelled);
    socket.on("queue:error", error);
    return () => {
      socket.off("room:created", roomCreated);
      socket.off("room:error", error);
      socket.off("queue:waiting", queueWaiting);
      socket.off("queue:matched", queueMatched);
      socket.off("queue:cancelled", queueCancelled);
      socket.off("queue:error", error);
    };
  }, [navigate, setPlayerName, trimmedUsername]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const persistUsername = () => {
    if (!trimmedUsername) {
      setNotice("Enter a username to continue.");
      playSound("incorrect");
      return false;
    }
    setPlayerName(trimmedUsername);
    setNotice("");
    return true;
  };

  const chooseView = (nextView: HomeView) => {
    if (!persistUsername()) return;
    playSound("navigate");
    setView(nextView);
  };

  const startQueue = () => {
    if (!persistUsername()) return;
    playSound("confirm");
    setView("queue");
    setQueueStartedAt(Date.now());
    connectSocket();
    socket.emit("queue:join", {
      username: trimmedUsername,
      mode: "anime",
      playlist,
    });
  };

  const createRoom = () => {
    if (!persistUsername()) return;
    if (selectedTitleIdsForPlaylist.length === 0) {
      setNotice("Select at least one anime.");
      playSound("incorrect");
      return;
    }
    setIsCreating(true);
    setNotice("");
    playSound("confirm");
    connectSocket();
    socket.emit("room:create-private", {
      username: trimmedUsername,
      mode: "anime",
      playlist,
      selectedTitleIds: selectedTitleIdsForPlaylist,
    });
  };

  const joinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomId);
    if (!persistUsername() || normalized.length !== 6) {
      if (normalized.length !== 6) setNotice("Enter a valid 6-character room code.");
      return;
    }
    playSound("confirm");
    navigate(`/room/${normalized}`);
  };

  const toggleTitle = (titleId: string) => {
    playSound("select");
    setSelectedTitleIds((current) =>
      current.includes(titleId)
        ? current.filter((id) => id !== titleId)
        : [...current, titleId],
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <button
          type="button"
          onClick={() => {
            playSound("navigate");
            setView("play");
          }}
          className="ui-title text-lg"
        >
          guess the ost
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs lowercase text-muted-foreground sm:inline">
            anime mode
          </span>
          <AppSettings />
        </div>
      </header>

      <main className="page-enter mx-auto w-full max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        {view === "play" && (
          <section className="mx-auto max-w-4xl">
            <div className="max-w-2xl">
              <p className="ui-label">two players · soundtrack showdown</p>
              <h1 className="ui-title mt-5 text-5xl leading-[0.96] sm:text-7xl">
                hear it.<br />name it first.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
               Can you guess the ost? Pick a name, find a match, and become the soundtrack sovereign.
              </p>
            </div>

            <PlaylistPicker playlist={playlist} onChange={setPlaylist} />

            <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
              <section className="surface p-5 sm:p-6">
                <label htmlFor="username" className="ui-label">your name</label>
                <Input
                  id="username"
                  value={username}
                  maxLength={18}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setNotice("");
                  }}
                  placeholder="enter a username"
                  className="mt-3 h-12 rounded-md bg-input px-4 text-base"
                />
                {notice && (
                  <p role="alert" className="mt-3 text-sm text-destructive">{notice}</p>
                )}
                <Button
                  type="button"
                  onClick={startQueue}
                  className="mt-6 h-12 w-full rounded-md bg-primary font-mono text-sm lowercase text-primary-foreground"
                >
                  <Sparkles size={16} /> quick match <ArrowRight size={16} />
                </Button>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <PathCard
                  icon={<Users size={20} />}
                  label="create private"
                  description="Choose an anime pool and invite a friend."
                  onClick={() => chooseView("create")}
                />
                <PathCard
                  icon={<LogIn size={20} />}
                  label="join by code"
                  description="Enter a six-character room code."
                  onClick={() => chooseView("join")}
                />
                <div className="rounded-lg border border-dashed border-border p-5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="ui-label">coming soon</p>
                      <p className="ui-title mt-1 text-base text-muted-foreground">video game ost</p>
                    </div>
                    <Gamepad2 className="text-muted-foreground" size={20} />
                  </div>
                </div>
              </section>
            </div>
          </section>
        )}

        {view === "queue" && (
          <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
            <div className="relative flex size-20 items-center justify-center rounded-full border border-border bg-card">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
            <p className="ui-label mt-8">public matchmaking</p>
            <h1 className="ui-title mt-2 text-4xl">finding your opponent</h1>
            <p className="mt-4 text-muted-foreground">
              Searching the {getAnimePlaylistLabel(playlist)} anime playlist for {trimmedUsername}.
            </p>
            <div className="mt-8 flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <Clock3 size={15} /> {queueSeconds}s elapsed
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                playSound("navigate");
                socket.emit("queue:cancel");
              }}
              className="mt-8 rounded-md font-mono text-xs lowercase"
            >
              <X size={15} /> cancel search
            </Button>
          </section>
        )}

        {view === "join" && (
          <FocusedShell title="join a room" onBack={() => setView("play")}>
            <form onSubmit={joinRoom} className="surface mx-auto max-w-lg p-6 sm:p-8">
              <label htmlFor="room-code" className="ui-label">room code</label>
              <Input
                id="room-code"
                autoFocus
                value={roomId}
                onChange={(event) => {
                  setRoomId(normalizeRoomCode(event.target.value));
                  setNotice("");
                }}
                placeholder="ABC123"
                maxLength={6}
                className="mt-3 h-14 rounded-md bg-input text-center font-mono text-xl uppercase tracking-[0.28em]"
              />
              {notice && <p role="alert" className="mt-3 text-sm text-destructive">{notice}</p>}
              <Button className="mt-6 h-12 w-full rounded-md font-mono text-sm lowercase">
                join room <ArrowRight size={16} />
              </Button>
            </form>
          </FocusedShell>
        )}

        {view === "create" && (
          <FocusedShell title="choose the soundtrack pool" onBack={() => setView("play")}>
            <PlaylistPicker playlist={playlist} onChange={setPlaylist} />
            <div className="mb-5 flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  value={titleSearch}
                  onChange={(event) => setTitleSearch(event.target.value)}
                  placeholder="search anime titles"
                  className="h-10 rounded-md bg-input pl-10"
                />
              </div>
              <div className="flex items-center justify-between gap-5 font-mono text-xs lowercase text-muted-foreground">
                <span>{selectedTitleIdsForPlaylist.length} selected</span>
                <span>{selectedTrackCount} tracks</span>
              </div>
            </div>

            <div className="quiet-scrollbar grid max-h-[52vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTitles.map((title) => {
                const selected = selectedTitleIds.includes(title.id);
                return (
                  <button
                    key={title.id}
                    type="button"
                    onClick={() => toggleTitle(title.id)}
                    aria-pressed={selected}
                    className={`interactive group relative min-h-36 overflow-hidden rounded-lg border text-left ${
                      selected ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <img src={title.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
                    <div className="absolute inset-0 bg-background/60" />
                    <div className="relative flex min-h-36 flex-col justify-between p-4">
                      <span className={`flex size-7 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/80"}`}>
                        {selected && <Check size={14} />}
                      </span>
                      <div>
                        <p className="line-clamp-2 font-semibold leading-snug">{title.canonicalTitle}</p>
                        <p className="ui-label mt-1">{getTracksForPlaylist(title, playlist).length} tracks</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="sticky bottom-4 mt-6 flex justify-end">
              <Button
                type="button"
                disabled={isCreating || selectedTitleIdsForPlaylist.length === 0}
                onClick={createRoom}
                className="h-12 rounded-md px-6 font-mono text-sm lowercase"
              >
                {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Users size={16} />}
                create room
              </Button>
            </div>
            {notice && <p role="alert" className="mt-3 text-right text-sm text-destructive">{notice}</p>}
          </FocusedShell>
        )}
      </main>
      <Toast message={toast} onDismiss={() => setToast("")} />
    </div>
  );
};

const playlistDescription = (playlist: AnimePlaylist) => {
  if (playlist === "easy") return "Up to 10 ranked soundtrack tracks per anime.";
  if (playlist === "op-ed") return "Full opening and ending themes.";
  return "All soundtrack tracks for each anime.";
};

const PlaylistPicker = ({ playlist, onChange }: { playlist: AnimePlaylist; onChange: (playlist: AnimePlaylist) => void }) => (
  <section className="surface mt-8 mb-5 p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="ui-label">playlist</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {playlistDescription(playlist)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Anime playlist">
        {(["standard", "easy", "op-ed"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={playlist === option}
            onClick={() => {
              playSound("select");
              onChange(option);
            }}
            className={`rounded-md border px-4 py-2 font-mono text-xs lowercase transition-colors ${
              playlist === option
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {getAnimePlaylistLabel(option)}
          </button>
        ))}
      </div>
    </div>
  </section>
);

const PathCard = ({ icon, label, description, onClick }: { icon: React.ReactNode; label: string; description: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="interactive surface group p-5 text-left hover:bg-secondary">
    <span className="flex size-10 items-center justify-center rounded-md border border-border bg-input text-primary">{icon}</span>
    <p className="ui-title mt-5 text-lg">{label}</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    <ArrowRight className="mt-5 text-muted-foreground transition-transform group-hover:translate-x-1" size={16} />
  </button>
);

const FocusedShell = ({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) => (
  <section className="mx-auto max-w-5xl">
    <button type="button" onClick={() => { playSound("navigate"); onBack(); }} className="interactive flex items-center gap-2 font-mono text-xs lowercase text-muted-foreground hover:text-foreground">
      <ArrowLeft size={15} /> back
    </button>
    <div className="mb-8 mt-6">
      <p className="ui-label">private match</p>
      <h1 className="ui-title mt-2 text-3xl sm:text-4xl">{title}</h1>
    </div>
    {children}
  </section>
);

export default Home;
