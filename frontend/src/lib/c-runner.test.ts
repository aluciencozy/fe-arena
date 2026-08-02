import assert from "node:assert/strict";
import test from "node:test";
import { CODING_PROBLEMS } from "../../../shared/coding-problems";
import { generateCSource, parseExecutionOutput, runCInWorker, type CExecutionOutcome } from "./c-runner";

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

test("runs the curated sum fixture after compilation completes", async () => {
  let receivedSource = "";
  const outcome = await runCInWorker(CODING_PROBLEMS[0]!, CODING_PROBLEMS[0]!.starterCode, {
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
