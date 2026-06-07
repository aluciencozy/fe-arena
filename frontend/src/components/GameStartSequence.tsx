import { useEffect, useState, useMemo } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useGameStateStore } from "@/store/gameStore";

interface GameStartSequenceProps {
  playerName: string;
  opponentName: string | null;
  onComplete?: () => void;
}

export const GameStartSequence = ({
  playerName,
  opponentName,
  onComplete,
}: GameStartSequenceProps) => {
  const phase = useGameStateStore((state) => state.phase);
  const [isVisible, setIsVisible] = useState(false);
  const shakeControls = useAnimationControls();

  // Generate a unique jagged path for the lightning strike on mount or when transition starts
  const lightningPath = useMemo(() => {
    if (!isVisible) return "";
    const width = 1200;
    const centerY = 100;
    const segments = 16;
    const segmentWidth = width / segments;
    let path = `M 0 ${centerY}`;
    
    for (let i = 1; i < segments; i++) {
      const x = i * segmentWidth + (Math.random() - 0.5) * (segmentWidth * 0.4);
      // Create jagged displacements alternating up and down
      const displacement = (i % 2 === 0 ? 1 : -1) * (20 + Math.random() * 30);
      path += ` L ${x} ${centerY + displacement}`;
    }
    path += ` L ${width} ${centerY}`;
    return path;
  }, [isVisible]);

  useEffect(() => {
    if (phase === "INTRO_ANIMATION") {
      setIsVisible(true);

      // Programmatically trigger the full-screen camera shakes on text landing
      // Player 1 Name drops at 2.2s, lands at 2.4s
      const shake1 = setTimeout(() => {
        shakeControls.start({
          x: [0, -6, 6, -4, 4, -2, 2, 0],
          y: [0, 8, -8, 6, -6, 3, -3, 0],
          transition: { duration: 0.2, ease: "easeOut" },
        });
      }, 2400);

      // "VS" drops at 2.4s, lands at 2.6s
      const shake2 = setTimeout(() => {
        shakeControls.start({
          x: [0, 8, -8, 5, -5, 3, -3, 0],
          y: [0, -10, 10, -7, 7, -3, 3, 0],
          transition: { duration: 0.25, ease: "easeOut" },
        });
      }, 2600);

      // Player 2 Name drops at 2.6s, lands at 2.8s
      const shake3 = setTimeout(() => {
        shakeControls.start({
          x: [0, -12, 12, -9, 9, -5, 5, 0],
          y: [0, 15, -15, 10, -10, 5, -5, 0],
          transition: { duration: 0.35, ease: "easeOut" },
        });
      }, 2800);

      // Auto-hide the sequence overlay after it finishes fading out (total time ~5.8s)
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 5800);

      return () => {
        clearTimeout(shake1);
        clearTimeout(shake2);
        clearTimeout(shake3);
        clearTimeout(hideTimer);
      };
    } else if (phase === "LOBBY") {
      setIsVisible(false);
    }
  }, [phase, shakeControls]);

  if (!isVisible) return null;

  const opponentDisplay = opponentName || "CHALLENGER";

  return (
    <motion.div
      className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        times: [0, 0.172, 0.828, 1], // 0s to 1.0s fade in (1.0/5.8 = 0.172), stay opaque until 4.8s (4.8/5.8 = 0.828), fade out from 4.8s to 5.8s
        duration: 5.8,
        ease: "easeInOut",
      }}
    >
      <motion.div
        animate={shakeControls}
        className="w-full h-full flex flex-col items-center justify-center bg-black select-none relative"
      >
        {/* BACKGROUND ELEMENTS: Grid lines or glowing smoke */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(31,40,51,0.2)_0%,rgba(0,0,0,1)_100%)]" />

        {/* SVG Canvas for Lightning Strike */}
        <div className="absolute inset-x-0 h-48 flex items-center justify-center z-10">
          <svg
            className="w-full h-full"
            viewBox="0 0 1200 200"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="lightning-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4dffbc" />
                <stop offset="50%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#ff4d4d" />
              </linearGradient>
              <filter id="glow-heavy" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="8" result="blur1" />
                <feGaussianBlur stdDeviation="4" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur1" />
                  <feMergeNode in="blur2" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background thick lightning blur/glow */}
            <motion.path
              d={lightningPath}
              fill="none"
              stroke="url(#lightning-grad)"
              strokeWidth={12}
              filter="url(#glow-heavy)"
              opacity={0.4}
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: 1,
                opacity: [0, 0.4, 0.1, 0.5, 0.2, 0.6, 0],
              }}
              transition={{
                pathLength: { delay: 2.0, duration: 0.2, ease: "linear" },
                opacity: { delay: 2.2, duration: 0.3, ease: "easeInOut" },
              }}
            />

            {/* Primary sharp lightning bolt */}
            <motion.path
              d={lightningPath}
              fill="none"
              stroke="url(#lightning-grad)"
              strokeWidth={4}
              filter="url(#glow-heavy)"
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: 1,
                opacity: [0, 0.3, 1.0, 0.4, 1.0, 0.3, 1.0, 0],
              }}
              transition={{
                pathLength: { delay: 2.0, duration: 0.2, ease: "linear" },
                opacity: {
                  delay: 2.0,
                  duration: 0.8,
                  times: [0, 0.15, 0.2, 0.35, 0.45, 0.6, 0.75, 1.0],
                  ease: "linear",
                },
              }}
            />
          </svg>
        </div>

        {/* Text smash downs */}
        <div className="relative z-20 flex items-center justify-center gap-6 md:gap-12 text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tighter uppercase italic select-none">
          
          {/* Player 1 Name */}
          <motion.div
            initial={{ y: -200, opacity: 0, scale: 1.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{
              delay: 2.2,
              duration: 0.2,
              type: "spring",
              stiffness: 400,
              damping: 15,
            }}
            className="text-player-1 text-player-1-glow font-black drop-shadow-[0_0_15px_var(--player-1-glow)]"
          >
            {playerName}
          </motion.div>

          {/* VS Divider */}
          <motion.div
            initial={{ y: -200, opacity: 0, scale: 2.2 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{
              delay: 2.4,
              duration: 0.2,
              type: "spring",
              stiffness: 400,
              damping: 15,
            }}
            className="text-white bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] px-2"
          >
            VS
          </motion.div>

          {/* Player 2 Name */}
          <motion.div
            initial={{ y: -200, opacity: 0, scale: 1.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{
              delay: 2.6,
              duration: 0.2,
              type: "spring",
              stiffness: 400,
              damping: 15,
            }}
            className="text-player-2 text-player-2-glow font-black drop-shadow-[0_0_15px_var(--player-2-glow)]"
          >
            {opponentDisplay}
          </motion.div>

        </div>
      </motion.div>
    </motion.div>
  );
};
