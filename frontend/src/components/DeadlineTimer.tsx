import { Clock3 } from "lucide-react";
import { useDeadlineSeconds } from "@/lib/deadline";

export const DeadlineTimer = ({
  deadline,
  urgentAfter = 10,
  className = "timer",
}: {
  deadline: number | null;
  urgentAfter?: number;
  className?: string;
}) => {
  const seconds = useDeadlineSeconds(deadline);
  const urgent = seconds !== null && seconds <= urgentAfter;
  const label =
    seconds === null
      ? "Time remaining unavailable"
      : urgent
        ? `Urgent: ${seconds} seconds remaining`
        : `${seconds} seconds remaining`;
  return (
    <span className={`${className} ${urgent ? "timer-hot" : ""}`} role="timer" aria-label={label}>
      <Clock3 size={16} aria-hidden="true" />
      <span>{seconds ?? "--"}s</span>
      {urgent && <span className="sr-only"> Time is running low.</span>}
    </span>
  );
};
