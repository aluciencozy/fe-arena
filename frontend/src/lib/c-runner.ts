import type { CodingProblem } from "../../../shared/domain";

export type CTestResult = { index: number; name: string; passed: boolean };
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
  kind: "ready" | "compiled" | "success" | "compile-error" | "runtime-error";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};
type WorkerLike = {
  postMessage: (message: { source: string }) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type WorkerFactory = () => WorkerLike;

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

export const runCInWorker = (
  problem: CodingProblem,
  studentCode: string,
  options: { timeoutMs?: number; initializationTimeoutMs?: number; createWorker?: WorkerFactory } = {},
): Promise<CExecutionOutcome> => {
  const executionTimeoutMs = options.timeoutMs ?? 2_500;
  const initializationTimeoutMs = options.initializationTimeoutMs ?? 30_000;
  const source = generateCSource(problem, studentCode);
  return new Promise((resolve) => {
    let worker: WorkerLike;
    try {
      worker = (options.createWorker ?? defaultWorkerFactory)();
    } catch (error) {
      resolve({
        kind: "runtime-error",
        stdout: "",
        stderr: error instanceof Error ? error.message : "The browser compiler worker could not start.",
        tests: [],
      });
      return;
    }
    let settled = false;
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
      try {
        worker.terminate();
      } catch (error) {
        void error;
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
            stderr: "Execution exceeded the 2.5 second safety limit.",
            tests: [],
          }),
        executionTimeoutMs,
      );
    };
    worker.onmessage = ({ data }) => {
      if (data.kind === "ready") {
        if (initializationTimer !== undefined) globalThis.clearTimeout(initializationTimer);
        startCompilationTimer();
        return;
      }
      if (data.kind === "compiled") {
        if (compilationTimer !== undefined) globalThis.clearTimeout(compilationTimer);
        startExecutionTimer();
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
      complete({
        kind: "runtime-error",
        stdout: "",
        stderr: event.message || "The browser compiler worker failed.",
        tests: [],
      });
    try {
      worker.postMessage({ source });
    } catch (error) {
      complete({
        kind: "runtime-error",
        stdout: "",
        stderr: error instanceof Error ? error.message : "The browser compiler worker could not receive the request.",
        tests: [],
      });
    }
  });
};
