import "dotenv/config";
import { ConfigurationError, getRuntimeConfig, startupDiagnostics } from "./src/config.js";
import { startServer } from "./src/server.js";

try {
  const config = getRuntimeConfig();
  console.info("FE Arena startup", startupDiagnostics(config));
  const runtime = await startServer(config);
  console.info(`FE Arena server listening on port ${config.port}`);
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`FE Arena shutting down (${signal})`);
    void runtime.close().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  if (error instanceof ConfigurationError) console.error(error.message);
  else console.error("FE Arena failed to start. Check the server configuration and Supabase connectivity.");
  process.exitCode = 1;
}
