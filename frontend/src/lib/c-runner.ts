import type { CodingProblem, CodingProgressUpdate } from "../../../shared/domain";

export type CTestResult = { index: number; name: string; passed: boolean };
export type CRunnerPhase =
  "worker" | "sdk" | "runtime" | "compiler" | "ready" | "compilation" | "execution" | "complete";
export type CRunnerStatus = {
  phase: CRunnerPhase;
  state: "idle" | "loading" | "ready" | "failed";
  message?: string;
};
export const codingProgressForRunnerStatus = (status: CRunnerStatus): CodingProgressUpdate | null => {
  if (status.state === "failed") return "failed";
  if (status.state !== "loading") return null;
  switch (status.phase) {
    case "worker":
      return "worker";
    case "sdk":
      return "sdk";
    case "runtime":
      return "runtime";
    case "compiler":
      return "compiler";
    case "compilation":
      return "compiling";
    case "execution":
      return "running";
    default:
      return null;
  }
};
export type CExecutionOutcome =
  | { kind: "success"; stdout: string; stderr: string; tests: CTestResult[]; passed: boolean }
  | { kind: "compile-error"; stdout: string; stderr: string; tests: CTestResult[] }
  | { kind: "runtime-error"; stdout: string; stderr: string; tests: CTestResult[]; exitCode?: number }
  | {
      kind: "timeout";
      phase: "initialization" | "compilation" | "execution";
      stdout: string;
      stderr: string;
      tests: CTestResult[];
    };

type WorkerMessage = {
  kind: "progress" | "ready" | "compiled" | "success" | "compile-error" | "runtime-error";
  phase?: "sdk" | "runtime" | "compiler";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};
type WorkerRequest = { kind?: "initialize"; source: string };
type WorkerLike = {
  postMessage: (message: WorkerRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type WorkerFactory = () => WorkerLike;
type RunnerOperation = "prewarm" | "run";

let prewarmedWorker: WorkerLike | undefined;
let prewarmPromise: Promise<void> | undefined;
let runnerStatus: CRunnerStatus = { phase: "worker", state: "idle" };
let prewarmStatus: CRunnerStatus = { phase: "worker", state: "idle" };
const allStatusListeners = new Set<(status: CRunnerStatus) => void>();
const prewarmStatusListeners = new Set<(status: CRunnerStatus) => void>();

const publishRunnerStatus = (status: CRunnerStatus, operation: RunnerOperation) => {
  runnerStatus = status;
  if (operation === "prewarm") {
    prewarmStatus = status;
  }
  for (const listener of allStatusListeners) listener(status);
  if (operation === "prewarm") for (const listener of prewarmStatusListeners) listener(status);
};

export const getCWorkerStatus = () => runnerStatus;
export const getCPrewarmStatus = () => prewarmStatus;
const subscribeToStatus = (
  listeners: Set<(status: CRunnerStatus) => void>,
  currentStatus: CRunnerStatus,
  listener: (status: CRunnerStatus) => void,
) => {
  listeners.add(listener);
  listener(currentStatus);
  return () => {
    listeners.delete(listener);
  };
};
export const subscribeCWorkerStatus = (listener: (status: CRunnerStatus) => void) => {
  return subscribeToStatus(allStatusListeners, runnerStatus, listener);
};
export const subscribeCPrewarmStatus = (listener: (status: CRunnerStatus) => void) =>
  subscribeToStatus(prewarmStatusListeners, prewarmStatus, listener);

export const generateCSource = (problem: CodingProblem, studentCode: string): string =>
  `${problem.prefix}\n${problem.functionSignature};\n${problem.testHarness}\n${problem.functionSignature} {\n${studentCode}\n}\n`;

export const parseExecutionOutput = (stdout: string, stderr: string, exitCode: number): CExecutionOutcome => {
  const tests: CTestResult[] = [];
  const outputLines: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^FEA_TEST\|(\d+)\|([^|]+)\|(PASS|FAIL)$/.exec(line.trim());
    if (match) {
      tests.push({ index: Number(match[1]), name: match[2]!, passed: match[3] === "PASS" });
    } else if (line.length > 0) {
      outputLines.push(line);
    }
  }
  const parsed = { stdout: outputLines.join("\n"), stderr, tests };
  if (exitCode !== 0) return { kind: "runtime-error", ...parsed, exitCode };
  if (tests.length === 0 || tests.every((test) => test.passed))
    return { kind: "success", ...parsed, passed: tests.length > 0 };
  return { kind: "success", ...parsed, passed: false };
};

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("../workers/c-runner.worker.ts", import.meta.url), { type: "module" });
const EXECUTION_TIMEOUT_MS = 30_000;
const MAX_TRANSIENT_RETRIES = 1;

const terminateWorker = (worker: WorkerLike) => {
  try {
    worker.terminate();
  } catch (error) {
    void error;
  }
};

const isReusableOutcome = (outcome: CExecutionOutcome) =>
  outcome.kind !== "timeout" && (outcome.kind !== "runtime-error" || outcome.exitCode !== undefined);

const isTransientCancellation = (outcome: CExecutionOutcome) =>
  outcome.kind === "runtime-error" && /oneshot\s+canceled/i.test(outcome.stderr);

const initializationFailure = (error: unknown): CExecutionOutcome => {
  const stderr = error instanceof Error ? error.message : "The browser compiler worker could not initialize.";
  if (stderr === "The browser compiler worker did not initialize within the startup limit.")
    return { kind: "timeout", phase: "initialization", stdout: "", stderr, tests: [] };
  return { kind: "runtime-error", stdout: "", stderr, tests: [] };
};

const initializeWorker = (
  worker: WorkerLike,
  timeoutMs: number,
  onProgress?: (phase: "sdk" | "runtime" | "compiler") => void,
) =>
  new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error("The browser compiler worker did not initialize within the startup limit."));
    }, timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      if (error) {
        worker.terminate();
        reject(error);
      } else resolve();
    };
    worker.onmessage = ({ data }) => {
      if (data.kind === "progress" && data.phase) onProgress?.(data.phase);
      if (data.kind === "ready") finish();
      if (data.kind === "compile-error" || data.kind === "runtime-error")
        finish(new Error(data.stderr || "The browser compiler worker failed during startup."));
    };
    worker.onerror = (event) => finish(new Error(event.message || "The browser compiler worker failed."));
    try {
      worker.postMessage({ kind: "initialize", source: "" });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("The browser compiler worker could not start."));
    }
  });

export const prewarmCWorker = (
  options: {
    initializationTimeoutMs?: number;
    createWorker?: WorkerFactory;
    onProgress?: (status: CRunnerStatus) => void;
  } = {},
): Promise<void> => {
  const scopedListener = options.onProgress;
  if (scopedListener) prewarmStatusListeners.add(scopedListener);
  const releaseScopedListener = () => {
    if (scopedListener) prewarmStatusListeners.delete(scopedListener);
  };
  if (prewarmedWorker) {
    publishRunnerStatus({ phase: "ready", state: "ready" }, "prewarm");
    releaseScopedListener();
    return Promise.resolve();
  }
  if (prewarmPromise) {
    void prewarmPromise.then(releaseScopedListener, releaseScopedListener);
    return prewarmPromise;
  }
  const workerFactory = options.createWorker ?? defaultWorkerFactory;
  publishRunnerStatus({ phase: "worker", state: "loading" }, "prewarm");
  let worker: WorkerLike;
  try {
    worker = workerFactory();
  } catch (error) {
    const failure = error instanceof Error ? error : new Error("The browser compiler worker could not start.");
    publishRunnerStatus({ phase: "worker", state: "failed", message: failure.message }, "prewarm");
    releaseScopedListener();
    return Promise.reject(failure);
  }
  prewarmPromise = initializeWorker(worker, options.initializationTimeoutMs ?? 30_000, (phase) =>
    publishRunnerStatus({ phase, state: "loading" }, "prewarm"),
  ).then(
    () => {
      prewarmedWorker = worker;
      publishRunnerStatus({ phase: "ready", state: "ready" }, "prewarm");
    },
    (error) => {
      prewarmPromise = undefined;
      const failure = error instanceof Error ? error : new Error("The browser compiler worker could not initialize.");
      publishRunnerStatus(
        {
          phase: failure.message.includes("startup") ? "worker" : prewarmStatus.phase,
          state: "failed",
          message: failure.message,
        },
        "prewarm",
      );
      throw failure;
    },
  );
  void prewarmPromise.then(releaseScopedListener, releaseScopedListener);
  return prewarmPromise;
};

export const runCInWorker = (
  problem: CodingProblem,
  studentCode: string,
  options: {
    timeoutMs?: number;
    initializationTimeoutMs?: number;
    createWorker?: WorkerFactory;
    onProgress?: (status: CRunnerStatus) => void;
  } = {},
): Promise<CExecutionOutcome> => {
  const executionTimeoutMs = options.timeoutMs ?? EXECUTION_TIMEOUT_MS;
  const initializationTimeoutMs = options.initializationTimeoutMs ?? 30_000;
  const source = generateCSource(problem, studentCode);
  const reportRunStatus = (status: CRunnerStatus) => {
    publishRunnerStatus(status, "run");
    options.onProgress?.(status);
  };
  const execute = (worker: WorkerLike) =>
    new Promise<CExecutionOutcome>((resolve) => {
      let settled = false;
      let activePhase: CRunnerPhase = "worker";
      let compilationTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
      let executionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
      const clearTimers = () => {
        if (initializationTimer !== undefined) globalThis.clearTimeout(initializationTimer);
        if (compilationTimer !== undefined) globalThis.clearTimeout(compilationTimer);
        if (executionTimer !== undefined) globalThis.clearTimeout(executionTimer);
      };
      const finish = (outcome: CExecutionOutcome) => {
        if (settled) return;
        settled = true;
        clearTimers();
        reportRunStatus(
          {
            phase: outcome.kind === "success" ? "complete" : activePhase,
            state: outcome.kind === "success" ? "ready" : "failed",
            ...(outcome.kind === "success"
              ? {}
              : { message: outcome.stderr || `${outcome.kind} during browser execution.` }),
          },
        );
        if (!options.createWorker && isReusableOutcome(outcome) && !prewarmedWorker && !prewarmPromise) {
          // Keep the initialized Wasmer runtime hot. Rebuilding the compiler
          // worker after every run makes the next run pay the full startup cost
          // again and can leave a Wasmer process wait without its owner.
          prewarmedWorker = worker;
        } else {
          terminateWorker(worker);
        }
        resolve(outcome);
      };
      const initializationTimer = globalThis.setTimeout(
        () =>
          finish({
            kind: "timeout",
            phase: "initialization",
            stdout: "",
            stderr: "The browser compiler worker did not initialize within the startup limit.",
            tests: [],
          }),
        initializationTimeoutMs,
      );
      const complete = (outcome: CExecutionOutcome) => finish(outcome);
      const startCompilationTimer = () => {
        if (settled || compilationTimer !== undefined) return;
        compilationTimer = globalThis.setTimeout(
          () =>
            finish({
              kind: "timeout",
              phase: "compilation",
              stdout: "",
              stderr: "Compilation exceeded the startup safety limit.",
              tests: [],
            }),
          initializationTimeoutMs,
        );
      };
      const startExecutionTimer = () => {
        if (settled || executionTimer !== undefined) return;
        executionTimer = globalThis.setTimeout(
          () =>
            finish({
              kind: "timeout",
              phase: "execution",
              stdout: "",
              stderr: "Execution exceeded the 30 second safety limit.",
              tests: [],
            }),
          executionTimeoutMs,
        );
      };
      worker.onmessage = ({ data }) => {
        if (data.kind === "ready") {
          if (initializationTimer !== undefined) globalThis.clearTimeout(initializationTimer);
          reportRunStatus({ phase: "ready", state: "ready" });
          activePhase = "compilation";
          startCompilationTimer();
          reportRunStatus({ phase: "compilation", state: "loading" });
          return;
        }
        if (data.kind === "compiled") {
          if (compilationTimer !== undefined) globalThis.clearTimeout(compilationTimer);
          activePhase = "execution";
          startExecutionTimer();
          reportRunStatus({ phase: "execution", state: "loading" });
          return;
        }
        if (data.kind === "compile-error") {
          complete({ kind: "compile-error", stdout: data.stdout ?? "", stderr: data.stderr ?? "", tests: [] });
          return;
        }
        if (data.kind === "runtime-error") {
          complete({
            kind: "runtime-error",
            stdout: data.stdout ?? "",
            stderr: data.stderr ?? "",
            tests: [],
            ...(data.exitCode === undefined ? {} : { exitCode: data.exitCode }),
          });
          return;
        }
        complete(parseExecutionOutput(data.stdout ?? "", data.stderr ?? "", data.exitCode ?? 0));
      };
      worker.onerror = (event) =>
        finish({
          kind: "runtime-error",
          stdout: "",
          stderr: event.message || "The browser compiler worker failed.",
          tests: [],
        });
      try {
        worker.postMessage({ source });
      } catch (error) {
        const outcome: CExecutionOutcome = {
          kind: "runtime-error",
          stdout: "",
          stderr: error instanceof Error ? error.message : "The browser compiler worker could not receive the request.",
          tests: [],
        };
        finish(outcome);
      }
    });
  const takeWorker = () => {
    if (!options.createWorker) {
      const worker = prewarmedWorker;
      if (!worker) throw new Error("The browser compiler worker was not prewarmed.");
      prewarmedWorker = undefined;
      prewarmPromise = undefined;
      return worker;
    }
    return options.createWorker();
  };
  const runAttempt = (attempt: number): Promise<CExecutionOutcome> => {
    const start = options.createWorker
      ? Promise.resolve().then(() => reportRunStatus({ phase: "worker", state: "loading" }))
      : prewarmCWorker({
          initializationTimeoutMs,
          onProgress: reportRunStatus,
        });
    return start
      .then(() => {
        try {
          return execute(takeWorker());
        } catch (error) {
          const failure = error instanceof Error ? error.message : "The browser compiler worker could not start.";
          reportRunStatus({ phase: "worker", state: "failed", message: failure });
          return {
            kind: "runtime-error" as const,
            stdout: "",
            stderr: failure,
            tests: [],
          };
        }
      }, initializationFailure)
      .then((outcome) => {
        if (attempt < MAX_TRANSIENT_RETRIES && isTransientCancellation(outcome)) return runAttempt(attempt + 1);
        return outcome;
      });
  };
  return runAttempt(0);
};
