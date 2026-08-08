import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { ArrowLeft, Check, CircleAlert, Clock3, Code2, Play, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { CODING_PROBLEMS } from "../../../shared/coding-problems";
import {
  getCPrewarmStatus,
  prewarmCWorker,
  runCInWorker,
  type CExecutionOutcome,
  type CRunnerStatus,
} from "@/lib/c-runner";
import { AppSettings } from "@/components/AppSettings";
import { CRunnerProgress } from "@/components/CRunnerProgress";
import { Select } from "@/components/ui/select";

export default function CPractice() {
  const [problemId, setProblemId] = useState(CODING_PROBLEMS[0]!.id);
  const problem = useMemo(() => CODING_PROBLEMS.find((item) => item.id === problemId)!, [problemId]);
  const [studentCode, setStudentCode] = useState(problem.starterCode);
  const [outcome, setOutcome] = useState<CExecutionOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<CRunnerStatus>(() => getCPrewarmStatus());
  const [prewarmError, setPrewarmError] = useState("");
  const capabilityReady = typeof window !== "undefined" && window.crossOriginIsolated;
  const startPrewarm = useCallback(() => {
    if (!capabilityReady) return;
    setPrewarmError("");
    void prewarmCWorker({ onProgress: setWorkerStatus }).catch((error) => {
      setPrewarmError(error instanceof Error ? error.message : "The browser C runner could not initialize.");
    });
  }, [capabilityReady]);

  useEffect(() => {
    // Start loading the SDK, runtime, and public compiler as soon as the lab
    // opens so the first click does not pay the complete cold-start cost.
    startPrewarm();
  }, [startPrewarm]);

  const chooseProblem = (nextId: string) => {
    const next = CODING_PROBLEMS.find((item) => item.id === nextId);
    if (!next) return;
    setProblemId(next.id);
    setStudentCode(next.starterCode);
    setOutcome(null);
  };
  const run = async () => {
    if (!capabilityReady) return;
    setRunning(true);
    setOutcome(null);
    setPrewarmError("");
    try {
      const result = await runCInWorker(problem, studentCode, { onProgress: setWorkerStatus });
      setOutcome(result);
    } catch (error) {
      setOutcome({
        kind: "runtime-error",
        stdout: "",
        stderr: error instanceof Error ? error.message : "The browser compiler worker failed.",
        tests: [],
      });
    } finally {
      setRunning(false);
    }
  };
  const reset = () => {
    setStudentCode(problem.starterCode);
    setOutcome(null);
  };

  return (
    <Shell>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-gold">
            <ArrowLeft size={15} /> home
          </Link>
          <span className="status-pill status-good">
            <Code2 size={12} /> browser-only C runner
          </span>
        </div>
        <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]">
          <aside className="space-y-5">
            <div>
              <p className="eyebrow text-gold">practice lab · temporary browser surface</p>
              <h1 className="display mt-3 text-5xl">FE Arena C practice</h1>
              <p className="mt-4 leading-7 text-muted">
                Try reviewed C function bodies locally in Chromium. Code stays in this browser; the server never
                compiles or receives it.
              </p>
            </div>
            <ProblemPicker problemId={problem.id} onChange={chooseProblem} disabled={running} />
            <article className="panel p-5 sm:p-6">
              <p className="eyebrow">prompt</p>
              <h2 className="mt-3 text-xl font-semibold">{problem.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{problem.description}</p>
              <p className="field-label mt-6">locked function signature</p>
              <code className="code-editor mt-2 block whitespace-pre-wrap text-sm">{problem.functionSignature}</code>
              <p className="field-label mt-6">starter code</p>
              <pre className="code-editor mt-2 max-h-48 overflow-auto text-xs text-muted">{problem.starterCode}</pre>
            </article>
            <div className="notice-info">
              <Clock3 size={16} className="mt-0.5 shrink-0" />
              <span>
                The browser compiler warms up while this page loads. A cold visit downloads the local toolchain and can
                take around 30 seconds; later runs reuse it. Worker startup, compilation, and execution each have a
                30-second limit. Infinite loops recover by terminating the worker.
              </span>
            </div>
          </aside>
          <section className="min-w-0">
            {!capabilityReady && (
              <div id="c-capability-help" className="notice-error mb-5" role="alert">
                <CircleAlert size={16} className="shrink-0" />
                <span>
                  This lab needs a cross-origin isolated Chromium tab. Use a supported Chromium-based browser, enable
                  the site&apos;s COOP/COEP headers, then reload the lab before running code.
                </span>
              </div>
            )}
            <CRunnerProgress status={workerStatus} error={prewarmError} onRetry={startPrewarm} />
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <p className="eyebrow">editable function body</p>
                  <p className="mt-1 text-xs text-muted">Only the body below is sent to the local worker.</p>
                </div>
                <button className="button button-ghost px-3 py-2 text-xs" onClick={reset} disabled={running}>
                  <RotateCcw size={14} /> reset starter
                </button>
              </div>
              <div className="border-b border-line bg-ink px-4 py-3 font-mono text-xs text-gold">
                <span className="text-muted">locked · </span>
                {problem.functionSignature} {"{"}
              </div>
              <Editor
                height="min(58vh, 560px)"
                language="c"
                theme="vs-dark"
                value={studentCode}
                onChange={(value) => setStudentCode(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  padding: { top: 16, bottom: 16 },
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  wordWrap: "on",
                  readOnly: running,
                }}
              />
              <div className="flex justify-end border-t border-line p-4">
                <button
                  className="button button-primary"
                  onClick={run}
                  disabled={!capabilityReady || running || !studentCode.trim()}
                  aria-describedby={!capabilityReady ? "c-capability-help" : undefined}
                >
                  <Play size={15} /> {running ? "compiling…" : "run tests"}
                </button>
              </div>
            </div>
            {outcome && <RunnerOutput outcome={outcome} />}
          </section>
        </section>
      </main>
    </Shell>
  );
}

const ProblemPicker = ({
  problemId,
  onChange,
  disabled,
}: {
  problemId: string;
  onChange: (problemId: string) => void;
  disabled: boolean;
}) => (
  <div>
    <label id="reviewed-problem-label" className="field-label" htmlFor="reviewed-problem">
      reviewed problem
    </label>
    <Select
      id="reviewed-problem"
      value={problemId}
      options={CODING_PROBLEMS.map((item) => ({ value: item.id, label: item.title }))}
      onChange={onChange}
      disabled={disabled}
      containerClassName="mt-2"
      ariaLabelledBy="reviewed-problem-label"
    />
  </div>
);

const RunnerOutput = ({ outcome }: { outcome: CExecutionOutcome }) => {
  const successful = outcome.kind === "success" && outcome.passed;
  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        {successful ? (
          <Check className="text-green-300" size={18} />
        ) : (
          <CircleAlert className="text-red-300" size={18} />
        )}
        <div>
          <p className="eyebrow">runner result</p>
          <h2 className="mt-1 font-semibold">
            {outcome.kind === "timeout"
              ? outcome.phase === "initialization"
                ? "compiler startup timed out"
                : outcome.phase === "compilation"
                  ? "compilation timed out"
                  : "execution timed out"
              : outcome.kind === "compile-error"
                ? "compile error"
                : outcome.kind === "runtime-error"
                  ? "runtime error"
                  : successful
                    ? "all tests passed"
                    : "tests need attention"}
          </h2>
          {!successful && (
            <p className="mt-2 text-xs text-muted">Edit the function body and run tests again to retry.</p>
          )}
        </div>
      </div>
      {outcome.tests.length > 0 && (
        <div className="grid gap-2 p-5 sm:grid-cols-2">
          {outcome.tests.map((test) => (
            <div
              key={test.index}
              className="flex items-center justify-between rounded border border-line bg-ink px-3 py-2 text-sm"
            >
              <span>{test.name}</span>
              <span className={test.passed ? "text-green-300" : "text-red-300"}>{test.passed ? "PASS" : "FAIL"}</span>
            </div>
          ))}
        </div>
      )}
      <OutputBlock label="stdout" value={outcome.stdout} />
      <OutputBlock label="compiler / runtime output" value={outcome.stderr} />
    </section>
  );
};

const OutputBlock = ({ label, value }: { label: string; value: string }) => (
  <div className="border-t border-line p-5">
    <p className="field-label">{label}</p>
    <pre className="code-editor mt-2 min-h-12 whitespace-pre-wrap text-xs text-muted">{value || "(empty)"}</pre>
  </div>
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-ink text-cream">
    <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-line px-5 py-5 sm:px-8">
      <Link to="/" className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded bg-gold font-black text-ink">FE</span>
        <span className="font-mono text-sm font-bold tracking-[.18em]">ARENA</span>
      </Link>
      <div className="flex items-center gap-5">
        <AppSettings />
        <span className="hidden text-xs text-muted sm:inline">v1 study room</span>
      </div>
    </header>
    {children}
  </div>
);
