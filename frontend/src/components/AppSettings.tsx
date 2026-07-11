import { useEffect, useRef, useState } from "react";
import { Settings, Volume2, VolumeX, X } from "lucide-react";
import { useGameStore } from "@/store/gameStore";
import { playSound } from "@/lib/sound";

export const AppSettings = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const volume = useGameStore((state) => state.volume);
  const sfxVolume = useGameStore((state) => state.sfxVolume);
  const setVolume = useGameStore((state) => state.setVolume);
  const setSfxVolume = useGameStore((state) => state.setSfxVolume);
  const musicMuted = useGameStore((state) => state.musicMuted);
  const sfxMuted = useGameStore((state) => state.sfxMuted);
  const setMusicMuted = useGameStore((state) => state.setMusicMuted);
  const setSfxMuted = useGameStore((state) => state.setSfxMuted);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={panelRef} className="relative z-50">
      <button
        type="button"
        onClick={() => {
          playSound("select");
          setOpen((value) => !value);
        }}
        className="interactive flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
        aria-label={open ? "Close settings" : "Open settings"}
        aria-expanded={open}
      >
        {open ? <X size={17} /> : <Settings size={17} />}
      </button>
      {open && (
        <section className="surface-raised page-enter absolute right-0 top-12 w-[min(19rem,calc(100vw-2rem))] p-5">
          <p className="ui-label">audio settings</p>
          <h2 className="ui-title mt-1 text-lg">sound</h2>
          <VolumeControl label="music" value={volume} muted={musicMuted} onChange={setVolume} onMute={() => setMusicMuted(!musicMuted)} />
          <VolumeControl label="sound effects" value={sfxVolume} muted={sfxMuted} onChange={setSfxVolume} onMute={() => setSfxMuted(!sfxMuted)} />
          <button
            type="button"
            onClick={() => playSound("correct")}
            className="interactive mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs lowercase text-secondary-foreground"
          >
            <Volume2 size={15} /> test sound
          </button>
        </section>
      )}
    </div>
  );
};

const VolumeControl = ({
  label,
  value,
  onChange,
  muted,
  onMute,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  muted: boolean;
  onMute: () => void;
}) => (
  <div className="mt-5 block">
    <span className="mb-2 flex items-center justify-between font-mono text-xs lowercase">
      <button type="button" onClick={() => { onMute(); playSound("select"); }} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
        {muted || value === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {label}
      </button>
      <span>{muted ? "muted" : `${value}%`}</span>
    </span>
    <input
      aria-label={`${label} volume`}
      type="range"
      min="0"
      max="100"
      step="5"
      value={value}
      disabled={muted}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-1.5 w-full cursor-pointer accent-primary"
    />
  </div>
);
