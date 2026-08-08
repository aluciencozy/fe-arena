import { Check, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import type { CExecutionOutcome, CRunnerStatus } from "@/lib/c-runner";

const loadingLabel = (phase: CRunnerStatus["phase"]) => {
  if (phase === "compilation" || phase === "compiler") return "compiling";
  if (phase === "execution") return "executing tests";
  return "preparing coding environment";
};

export const CRunnerStatusLine = ({
  status,
  error = "",
  outcome = null,
  active = false,
  onRetry,
  retryDisabled = false,
}: {
  status: CRunnerStatus;
  error?: string;
  outcome?: CExecutionOutcome | null;
  active?: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
}) => {
  const failed = status.state === "failed" || Boolean(outcome && outcome.kind !== "success");
  const testsNeedAttention = outcome?.kind === "success" && !outcome.passed;
  const retryable = failed || testsNeedAttention;
  const loading = active || status.state === "loading";
  const outcomeLabel =
    outcome?.kind === "compile-error"
      ? "compile error - fix the code and try again"
      : outcome?.kind === "runtime-error"
        ? "runtime error - try again"
        : outcome?.kind === "timeout"
          ? `${outcome.phase} timed out - try again`
          : undefined;
  const label = loading
    ? loadingLabel(status.phase)
    : testsNeedAttention
      ? "tests need attention"
      : outcomeLabel
        ? outcomeLabel
        : outcome?.kind === "success" && outcome.passed
          ? "all tests passed"
          : failed
            ? "runner unavailable"
            : status.state === "ready" || status.phase === "ready"
              ? "coding environment ready"
              : "ready to run tests";
  return (
    <div className="flex min-h-8 items-center gap-2 text-sm text-muted" aria-live="polite" role="status">
      {loading ? (
        <LoaderCircle size={15} className="animate-spin text-gold" aria-hidden="true" />
      ) : failed || testsNeedAttention ? (
        <CircleAlert size={15} className="text-red-300" aria-hidden="true" />
      ) : (
        <Check size={15} className="text-green-300" aria-hidden="true" />
      )}
      <span>{error && failed && !outcome ? error : label}</span>
      {onRetry && retryable && (
        <button
          className="button button-ghost ml-1 px-2 py-1 text-xs"
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
        >
          <RotateCcw size={13} /> retry
        </button>
      )}
    </div>
  );
};
