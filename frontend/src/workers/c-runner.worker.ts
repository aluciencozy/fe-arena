import { Directory, Wasmer, init, runWasix } from "@wasmer/sdk";

type RunRequest = { source: string };
type RunResponse = {
  kind: "success" | "compile-error" | "runtime-error";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};

let initialized: Promise<void> | undefined;
let compiler: Wasmer | undefined;

const initialize = async () => {
  initialized ??= init().then(() => undefined);
  await initialized;
  if (!compiler) {
    // The compiler package is fetched as public WASM by the SDK; no application or database credentials are used.
    const packageDefinition = await Wasmer.fromRegistry("clang/clang@0.160000.1");
    compiler = packageDefinition;
  }
};

self.onmessage = async ({ data }: MessageEvent<RunRequest>) => {
  try {
    await initialize();
    const files = new Directory({ "main.c": data.source });
    if (!compiler) throw new Error("The browser C compiler package did not initialize.");
    const command = compiler.commands.clang ?? compiler.entrypoint;
    if (!command) throw new Error("The browser C compiler package has no clang command.");
    const compile = await command.run({
      args: [
        "-x",
        "c",
        "-std=c11",
        "-O0",
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
        stdout: compileOutput.stdout,
        stderr: compileOutput.stderr,
        exitCode: compileOutput.code,
      } satisfies RunResponse);
      return;
    }
    const executable = await files.readFile("program.wasm");
    const execution = await runWasix(executable, { mount: { "/workspace": files }, cwd: "/workspace" });
    const output = await execution.wait();
    self.postMessage({
      kind: output.ok ? "success" : "runtime-error",
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: output.code,
    } satisfies RunResponse);
  } catch (error) {
    self.postMessage({
      kind: "runtime-error",
      stderr: error instanceof Error ? error.message : "Browser execution failed.",
    } satisfies RunResponse);
  }
};
