import { COUNTDOWN_SECONDS } from "../../../shared/game.constants.ts";

export const getCountdownSeconds = (endsAt: number | null, now: number) =>
  endsAt === null
    ? null
    : Math.min(
        COUNTDOWN_SECONDS,
        Math.max(0, Math.ceil((endsAt - now) / 1000)),
      );

export const shouldPlayCountdownCue = (
  phase: string,
  seconds: number | null,
  previousSeconds: number | null,
) =>
  phase === "COUNTDOWN" &&
  seconds !== null &&
  seconds > 0 &&
  seconds !== previousSeconds;
