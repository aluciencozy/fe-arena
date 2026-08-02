import type { CodingProblem } from "../../../shared/domain";

export type CTestResult = { index: number; name: string; passed: boolean };
export type CExecutionOutcome =
  | { kind: "success"; stdout: string; stderr: string; tests: CTestResult[]; passed: boolean }
  | { kind: "compile-error"; stdout: string; stderr: string; tests: CTestResult[] }
  | { kind: "runtime-error"; stdout: string; stderr: string; tests: CTestResult[]; exitCode?: number }
  | { kind: "timeout"; stdout: string; stderr: string; tests: CTestResult[] };

type WorkerMessage = {
  kind: "success" | "compile-error" | "runtime-error";
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
  `${problem.prefix}\n${problem.functionSignature} {\n${studentCode}\n}\n${problem.testHarness}\n`;

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
  options: { timeoutMs?: number; createWorker?: WorkerFactory } = {},
): Promise<CExecutionOutcome> => {
  const worker = (options.createWorker ?? defaultWorkerFactory)();
  const timeoutMs = options.timeoutMs ?? 2_500;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: CExecutionOutcome) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(outcome);
    };
    const timer = globalThis.setTimeout(
      () =>
        finish({ kind: "timeout", stdout: "", stderr: "Execution exceeded the 2.5 second safety limit.", tests: [] }),
      timeoutMs,
    );
    const complete = (outcome: CExecutionOutcome) => {
      globalThis.clearTimeout(timer);
      finish(outcome);
    };
    worker.onmessage = ({ data }) => {
      if (data.kind === "compile-error") {
        complete({ kind: "compile-error", stdout: data.stdout ?? "", stderr: data.stderr ?? "", tests: [] });
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
    worker.postMessage({ source: generateCSource(problem, studentCode) });
  });
};
