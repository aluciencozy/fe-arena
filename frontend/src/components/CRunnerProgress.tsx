import { RotateCcw } from "lucide-react";
import type { CRunnerPhase, CRunnerStatus } from "@/lib/c-runner";

const RUNNER_PHASES: Array<{ phase: CRunnerPhase; label: string }> = [
  { phase: "worker", label: "Worker creation" },
  { phase: "sdk", label: "SDK loading" },
  { phase: "runtime", label: "Runtime loading" },
  { phase: "compiler", label: "Compiler loading" },
  { phase: "compilation", label: "Compilation" },
  { phase: "execution", label: "Execution" },
];

export const CRunnerProgress = ({
  status,
  error,
  onRetry,
  retryLabel = "retry setup",
  retryDisabled = false,
}: {
  status: CRunnerStatus;
  error: string;
  onRetry: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
}) => {
  const currentIndex =
    status.phase === "complete" || status.phase === "ready"
      ? RUNNER_PHASES.length
      : RUNNER_PHASES.findIndex((item) => item.phase === status.phase);
  return (
    <section className="panel mb-5 p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-gold">coding environment setup</p>
          <p className="mt-1 text-sm text-muted">Phases report state only; no unmeasured percentage is shown.</p>
        </div>
        {(error || status.state === "failed") && (
          <button
            className="button button-ghost px-3 py-2 text-xs"
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
          >
            <RotateCcw size={14} /> {retryLabel}
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {RUNNER_PHASES.map((item, index) => {
          const failed = status.state === "failed" && status.phase === item.phase;
          const active = !failed && index === currentIndex && status.state === "loading";
          const complete = index < currentIndex;
          return (
            <div
              key={item.phase}
              className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm"
            >
              <span>{item.label}</span>
              <span
                className={failed ? "text-red-300" : complete ? "text-green-300" : active ? "text-gold" : "text-muted"}
              >
                {failed ? "failed" : complete ? "ready" : active ? "loading…" : "waiting"}
              </span>
            </div>
          );
        })}
      </div>
      {(error || status.message) && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error || status.message}
        </p>
      )}
    </section>
  );
};
