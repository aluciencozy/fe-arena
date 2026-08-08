import assert from "node:assert/strict";
import test from "node:test";
import { CODING_PROBLEMS } from "../../../shared/coding-problems";
import {
  generateCSource,
  parseExecutionOutput,
  codingProgressForRunnerStatus,
  getCWorkerStatus,
  prewarmCWorker,
  runCInWorker,
  subscribeCWorkerStatus,
  type CExecutionOutcome,
} from "./c-runner";

test("maps browser runner phases to typed match progress without percentages", () => {
  assert.equal(codingProgressForRunnerStatus({ phase: "worker", state: "loading" }), "worker");
  assert.equal(codingProgressForRunnerStatus({ phase: "sdk", state: "loading" }), "sdk");
  assert.equal(codingProgressForRunnerStatus({ phase: "runtime", state: "loading" }), "runtime");
  assert.equal(codingProgressForRunnerStatus({ phase: "compiler", state: "loading" }), "compiler");
  assert.equal(codingProgressForRunnerStatus({ phase: "compilation", state: "loading" }), "compiling");
  assert.equal(codingProgressForRunnerStatus({ phase: "execution", state: "loading" }), "running");
  assert.equal(codingProgressForRunnerStatus({ phase: "execution", state: "failed", message: "trap" }), "failed");
  assert.equal(codingProgressForRunnerStatus({ phase: "complete", state: "ready" }), null);
});

test("generates a complete C translation unit without allowing signature edits", () => {
  const problem = CODING_PROBLEMS[0]!;
  const source = generateCSource(problem, "return 42;");
  assert.equal(
    source,
    `${problem.prefix}\n${problem.functionSignature};\n${problem.testHarness}\n${problem.functionSignature} {\nreturn 42;\n}\n`,
  );
  assert.match(source, /int sum_array\(const int values\[\], size_t length\);/);
  assert.match(source, /FEA_TEST\|1\|mixed values/);
});

test("keeps the test harness before editable preprocessor directives", () => {
  const problem = CODING_PROBLEMS[0]!;
  const studentCode = 'const char marker[] = "/* */";\n#define sum_array(...) 0\nreturn 42;';
  const source = generateCSource(problem, studentCode);
  assert.ok(source.indexOf(problem.testHarness) < source.lastIndexOf(studentCode));
});

test("parses machine-readable test results while preserving student stdout", () => {
  const result = parseExecutionOutput("hello\nFEA_TEST|1|first case|PASS\nFEA_TEST|2|second case|FAIL\n", "", 0);
  assert.deepEqual(result, {
    kind: "success",
    stdout: "hello",
    stderr: "",
    tests: [
      { index: 1, name: "first case", passed: true },
      { index: 2, name: "second case", passed: false },
    ],
    passed: false,
  });
});

test("shares an in-flight prewarm and permits one retry after initialization failure", async () => {
  let workerCount = 0;
  const statuses: string[] = [];
  const unsubscribe = subscribeCWorkerStatus((status) => statuses.push(`${status.phase}:${status.state}`));
  const createWorker = () => {
    workerCount += 1;
    const worker = {
      onmessage: null as ((event: MessageEvent<{ kind: string }>) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage: () => {
        if (workerCount === 1) {
          setTimeout(() => worker.onerror?.({ message: "transient startup failure" } as ErrorEvent), 0);
        } else {
          setTimeout(() => {
            worker.onmessage?.({ data: { kind: "progress", phase: "sdk" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "progress", phase: "runtime" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "progress", phase: "compiler" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "ready" } } as MessageEvent);
          }, 0);
        }
      },
      terminate: () => undefined,
    };
    return worker;
  };

  await assert.rejects(prewarmCWorker({ createWorker }), /transient startup failure/);
  const first = prewarmCWorker({ createWorker });
  const second = prewarmCWorker({ createWorker });
  assert.strictEqual(first, second);
  await Promise.all([first, second]);
  unsubscribe();
  assert.equal(workerCount, 2);
  assert.ok(statuses.includes("worker:loading"));
  assert.ok(statuses.includes("sdk:loading"));
  assert.ok(statuses.includes("runtime:loading"));
  assert.ok(statuses.includes("compiler:loading"));
  assert.equal(getCWorkerStatus().phase, "ready");
});

test("runs the curated sum fixture after compilation completes", async () => {
  let receivedSource = "";
  const progress: string[] = [];
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, CODING_PROBLEMS[0]!.starterCode, {
    onProgress: (status) => progress.push(`${status.phase}:${status.state}`),
    createWorker: () => {
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage: (message: { source: string }) => {
          receivedSource = message.source;
          setTimeout(() => {
            worker.onmessage?.({ data: { kind: "ready" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "compiled" } } as MessageEvent);
            worker.onmessage?.({
              data: {
                kind: "success",
                stdout: "FEA_TEST|1|mixed values|PASS\nFEA_TEST|2|zero included|PASS\n",
                stderr: "",
                exitCode: 0,
              },
            } as MessageEvent);
          }, 0);
        },
        terminate: () => undefined,
      };
      return worker;
    },
  });
  assert.equal(outcome.kind, "success");
  if (outcome.kind === "success") assert.equal(outcome.passed, true);
  assert.match(receivedSource, /int sum_array\(const int values\[\], size_t length\)/);
  assert.ok(progress.includes("worker:loading"));
  assert.ok(progress.includes("compilation:loading"));
  assert.ok(progress.includes("execution:loading"));
});

test("retries a transient Wasmer cancellation with a fresh worker", async () => {
  let workerCount = 0;
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, CODING_PROBLEMS[0]!.starterCode, {
    createWorker: () => {
      workerCount += 1;
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage: () => {
          setTimeout(() => {
            worker.onmessage?.({ data: { kind: "ready" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "compiled" } } as MessageEvent);
            worker.onmessage?.({
              data:
                workerCount === 1
                  ? { kind: "runtime-error", stderr: "oneshot canceled" }
                  : {
                      kind: "success",
                      stdout: "FEA_TEST|1|mixed values|PASS\n",
                      stderr: "",
                      exitCode: 0,
                    },
            } as MessageEvent);
          }, 0);
        },
        terminate: () => undefined,
      };
      return worker;
    },
  });

  assert.equal(outcome.kind, "success");
  assert.equal(workerCount, 2);
});

test("classifies non-zero WASM exits as runtime errors", () => {
  const result = parseExecutionOutput("FEA_TEST|1|crash|FAIL", "trap", wasmExitCode());
  assert.equal(result.kind, "runtime-error");
  assert.equal(result.stderr, "trap");
});

test("terminates an unresponsive worker and returns a typed timeout", async () => {
  let terminated = false;
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, "while (1) {}", {
    timeoutMs: 5,
    createWorker: () => {
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage: () =>
          setTimeout(() => {
            worker.onmessage?.({ data: { kind: "ready" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "compiled" } } as MessageEvent);
          }, 0),
        terminate: () => {
          terminated = true;
        },
      };
      return worker;
    },
  });
  assert.equal(outcome.kind, "timeout");
  if (outcome.kind === "timeout") assert.equal(outcome.phase, "execution");
  assert.equal(terminated, true);
});

test("starts the execution limit after compiler initialization", async () => {
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, "return 0;", {
    timeoutMs: 5,
    initializationTimeoutMs: 100,
    createWorker: () => {
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage: () =>
          setTimeout(() => {
            worker.onmessage?.({ data: { kind: "ready" } } as MessageEvent);
            worker.onmessage?.({ data: { kind: "compiled" } } as MessageEvent);
          }, 10),
        terminate: () => undefined,
      };
      return worker;
    },
  });
  assert.equal(outcome.kind, "timeout");
  if (outcome.kind === "timeout") assert.equal(outcome.phase, "execution");
});

test("preserves worker runtime failures without an exit code", async () => {
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, "return 0;", {
    createWorker: () => {
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage: () =>
          setTimeout(() => {
            worker.onmessage?.({ data: { kind: "runtime-error", stderr: "SDK unavailable" } } as MessageEvent);
          }, 0),
        terminate: () => undefined,
      };
      return worker;
    },
  });
  assert.deepEqual(outcome, {
    kind: "runtime-error",
    stdout: "",
    stderr: "SDK unavailable",
    tests: [],
  });
});

test("returns a typed runtime error when the worker cannot start", async () => {
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, "return 0;", {
    createWorker: () => {
      throw new Error("worker construction failed");
    },
  });
  assert.deepEqual(outcome, {
    kind: "runtime-error",
    stdout: "",
    stderr: "worker construction failed",
    tests: [],
  });
});

test("returns a typed runtime error when the worker rejects the request", async () => {
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, "return 0;", {
    createWorker: () => ({
      onmessage: null,
      onerror: null,
      postMessage: () => {
        throw new Error("request rejected");
      },
      terminate: () => undefined,
    }),
  });
  assert.deepEqual(outcome, {
    kind: "runtime-error",
    stdout: "",
    stderr: "request rejected",
    tests: [],
  });
});

test("returns worker failures as runtime errors", async () => {
  const outcomePromise = runCInWorker(CODING_PROBLEMS[0]!, "return 0;", {
    createWorker: () => {
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        postMessage: () => setTimeout(() => worker.onerror?.({ message: "worker unavailable" } as ErrorEvent), 0),
        terminate: () => undefined,
      };
      return worker;
    },
  });
  const outcome: CExecutionOutcome = await outcomePromise;
  assert.equal(outcome.kind, "runtime-error");
  assert.equal(outcome.stderr, "worker unavailable");
});

const wasmExitCode = () => 134;
