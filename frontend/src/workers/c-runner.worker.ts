import type { Runtime, Wasmer } from "@wasmer/sdk";

type RunRequest = { kind?: "initialize"; source: string };
type RunResponse = {
  kind: "ready" | "compiled" | "success" | "compile-error" | "runtime-error";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};
type WasmerSdk = typeof import("@wasmer/sdk");

let initialized: Promise<void> | undefined;
let compiler: Wasmer | undefined;
let runtime: Runtime | undefined;
let sdk: WasmerSdk | undefined;
const MAX_OUTPUT_LENGTH = 32_768;
const boundedOutput = (value: string | undefined) => {
  const output = value ?? "";
  return output.length > MAX_OUTPUT_LENGTH ? `${output.slice(0, MAX_OUTPUT_LENGTH)}\n[output truncated]` : output;
};

const initialize = async () => {
  const loadedSdk = sdk ?? (sdk = await import("@wasmer/sdk"));
  initialized ??= loadedSdk.init().then(() => undefined);
  await initialized;
  runtime ??= new loadedSdk.Runtime();
  if (!compiler) {
    // The compiler package is fetched as public WASM by the SDK; no application or database credentials are used.
    const packageDefinition = await loadedSdk.Wasmer.fromRegistry("clang/clang@0.160000.1", runtime);
    compiler = packageDefinition;
  }
  return loadedSdk;
};

self.onmessage = async ({ data }: MessageEvent<RunRequest>) => {
  try {
    const loadedSdk = await initialize();
    self.postMessage({ kind: "ready" } satisfies RunResponse);
    if (data.kind === "initialize") return;
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
    // Run the locally compiled module through the same Wasmer WASIX runtime
    // that loaded the compiler. The standalone @wasmer/wasi adapter cannot
    // satisfy the compiler package's wasix_32v1 imports, and compiling a
    // local module through a second runtime triggers Chromium's module
    // serialization boundary.
    const executable = new Uint8Array(await files.readFile("program.wasm"));
    if (!runtime) throw new Error("The browser C runtime did not initialize.");
    const executablePackage = loadedSdk.Wasmer.fromWasm(executable, runtime);
    const executableCommand = executablePackage.entrypoint;
    if (!executableCommand) throw new Error("The compiled C program has no executable entrypoint.");
    const instance = await executableCommand.run({ args: ["program"] });
    self.postMessage({ kind: "compiled" } satisfies RunResponse);
    const output = await instance.wait();
    self.postMessage({
      kind: output.code === 0 ? "success" : "runtime-error",
      stdout: boundedOutput(output.stdout),
      stderr: boundedOutput(output.stderr),
      exitCode: output.code,
    } satisfies RunResponse);
  } catch (error) {
    self.postMessage({
      kind: "runtime-error",
      stderr: boundedOutput(error instanceof Error ? error.message : "Browser execution failed."),
    } satisfies RunResponse);
  }
};
