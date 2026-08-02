import { Buffer } from "buffer";
import type { Wasmer } from "@wasmer/sdk";

type RunRequest = { source: string };
type RunResponse = {
  kind: "ready" | "compiled" | "success" | "compile-error" | "runtime-error";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};
type WasmerSdk = typeof import("@wasmer/sdk");

let initialized: Promise<void> | undefined;
let compiler: Wasmer | undefined;
let sdk: WasmerSdk | undefined;
const MAX_OUTPUT_LENGTH = 32_768;
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
const boundedOutput = (value: string | undefined) => {
  const output = value ?? "";
  return output.length > MAX_OUTPUT_LENGTH ? `${output.slice(0, MAX_OUTPUT_LENGTH)}\n[output truncated]` : output;
};

const initialize = async () => {
  const loadedSdk = sdk ?? (sdk = await import("@wasmer/sdk"));
  initialized ??= loadedSdk.init().then(() => undefined);
  await initialized;
  if (!compiler) {
    // The compiler package is fetched as public WASM by the SDK; no application or database credentials are used.
    const packageDefinition = await loadedSdk.Wasmer.fromRegistry("clang/clang@0.160000.1");
    compiler = packageDefinition;
  }
  return loadedSdk;
};

self.onmessage = async ({ data }: MessageEvent<RunRequest>) => {
  try {
    const loadedSdk = await initialize();
    self.postMessage({ kind: "ready" } satisfies RunResponse);
    const files = new loadedSdk.Directory({ "main.c": data.source });
    if (!compiler) throw new Error("The browser C compiler package did not initialize.");
    const command = compiler.commands.clang ?? compiler.entrypoint;
    if (!command) throw new Error("The browser C compiler package has no clang command.");
    const compile = await command.run({
      args: [
        "-x",
        "c",
        "-std=c11",
        "-O0",
        "-Wl,--strip-all",
        "--target=wasm32-wasi",
        "/workspace/main.c",
        "-o",
        "/workspace/program.wasm",
      ],
      mount: { "/workspace": files },
    });
    const compileOutput = await compile.wait();
    if (!compileOutput.ok) {
      self.postMessage({
        kind: "compile-error",
        stdout: boundedOutput(compileOutput.stdout),
        stderr: boundedOutput(compileOutput.stderr),
        exitCode: compileOutput.code,
      } satisfies RunResponse);
      return;
    }
    // Directory.readFile may expose a view backed by the SDK's shared WASM memory.
    // Copy it before handing it to the standalone WASI adapter; the SDK's
    // browser runtime cannot serialize local modules in Chromium.
    const executable = new Uint8Array(await files.readFile("program.wasm"));
    const wasiSdk = await import("@wasmer/wasi");
    await wasiSdk.init();
    const executableModule = await WebAssembly.compile(executable);
    self.postMessage({ kind: "compiled" } satisfies RunResponse);
    const wasi = new wasiSdk.WASI({ args: ["program"] });
    const wasiImports = wasi.getImports(executableModule) as WebAssembly.Imports &
      Record<string, Record<string, unknown>>;
    wasiImports.env = { memory: new WebAssembly.Memory({ initial: 16, maximum: 16 }) };
    wasiImports.wasix_32v1 = {
      callback_signal: () => 0,
      futex_wait: () => 0,
      futex_wake: () => 0,
      futex_wake_all: () => 0,
    };
    const instance = await wasi.instantiate(executableModule, wasiImports);
    const exitCode = wasi.start(instance);
    self.postMessage({
      kind: exitCode === 0 ? "success" : "runtime-error",
      stdout: boundedOutput(wasi.getStdoutString()),
      stderr: boundedOutput(wasi.getStderrString()),
      exitCode,
    } satisfies RunResponse);
  } catch (error) {
    self.postMessage({
      kind: "runtime-error",
      stderr: boundedOutput(error instanceof Error ? error.message : "Browser execution failed."),
    } satisfies RunResponse);
  }
};
