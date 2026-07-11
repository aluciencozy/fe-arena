import { useGameStore } from "@/store/gameStore";

export type SoundCue =
  | "navigate"
  | "confirm"
  | "select"
  | "copy"
  | "countdown"
  | "round-start"
  | "correct"
  | "incorrect"
  | "damage"
  | "reveal"
  | "victory"
  | "defeat";

const cueFrequencies: Record<SoundCue, [number, number, number]> = {
  navigate: [330, 390, 0.08],
  confirm: [440, 590, 0.1],
  select: [300, 340, 0.06],
  copy: [520, 700, 0.1],
  countdown: [340, 340, 0.12],
  "round-start": [420, 760, 0.18],
  correct: [520, 880, 0.22],
  incorrect: [260, 180, 0.2],
  damage: [190, 110, 0.18],
  reveal: [360, 520, 0.2],
  victory: [440, 920, 0.32],
  defeat: [260, 130, 0.3],
};

let audioContext: AudioContext | null = null;

export const playSound = (cue: SoundCue) => {
  const { sfxVolume: volume, sfxMuted } = useGameStore.getState();
  if (sfxMuted) return;
  if (volume <= 0 || typeof window === "undefined") return;

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;

  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") void audioContext.resume();

  const [startFrequency, endFrequency, duration] = cueFrequencies[cue];
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const start = audioContext.currentTime;
  const level = Math.max(0.0001, (volume / 100) * 0.11);

  oscillator.type = cue === "damage" || cue === "defeat" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
};
