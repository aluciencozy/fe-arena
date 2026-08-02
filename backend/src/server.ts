import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./http/app.js";
import { createMatchRepository } from "./persistence/index.js";
import { setAccountHistoryRepository } from "./services/account-history.service.js";
import { createAuthVerifier } from "./services/auth.service.js";
import { loadQuestionRepository, setQuestionRepository } from "./services/question-bank.service.js";
import { setMatchRepository } from "./services/match.service.js";
import { registerHandlers } from "./sockets/handlers.js";
import type { RuntimeConfig } from "./config.js";
import { FixedWindowLimiter, isAllowedOrigin } from "./security.js";

export type ServerRuntime = {
  httpServer: HttpServer;
  io: Server;
  close: () => Promise<void>;
};

export const createServerRuntime = async (config: RuntimeConfig): Promise<ServerRuntime> => {
  const matchRepository = createMatchRepository();
  setMatchRepository(matchRepository);
  setAccountHistoryRepository(matchRepository);
  // A configured Supabase question bank is intentionally fail-closed: serving a partial or stale bank in production is unsafe.
  const questionRepository = await loadQuestionRepository();
  setQuestionRepository(questionRepository);
  const authVerifier = createAuthVerifier();
  const app = createApp({
    runtimeConfig: config,
    authVerifier,
    accountHistoryRepository: matchRepository,
    persistence: { configured: config.supabase.configured, mode: config.supabase.configured ? "supabase" : "in-memory-fallback", ready: true },
  });

  const httpServer = createHttpServer(app);
  httpServer.requestTimeout = 15_000;
  httpServer.headersTimeout = 20_000;
  httpServer.keepAliveTimeout = 5_000;
  const connectionLimiter = new FixedWindowLimiter(60, 60_000);
  const activeByAddress = new Map<string, number>();
  const io = new Server(httpServer, {
    cors: { origin: [...config.frontendOrigins], methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] },
    maxHttpBufferSize: 16 * 1024,
    pingTimeout: 20_000,
    pingInterval: 25_000,
    allowRequest: (request, callback) => {
      const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
      if (!isAllowedOrigin(origin, config.frontendOrigins, config.isProduction)) return callback("Origin is not allowed.", false);
      const address = request.socket.remoteAddress ?? "unknown";
      const decision = connectionLimiter.check(address);
      if (!decision.allowed) return callback("Connection rate limit exceeded.", false);
      const active = activeByAddress.get(address) ?? 0;
      if (active >= 50) return callback("Too many active connections.", false);
      return callback(null, true);
    },
  });
  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.accessToken === "string" ? socket.handshake.auth.accessToken : "";
    // Invalid/missing auth never blocks guest play. It simply leaves this socket anonymous.
    try {
      socket.data.authUserId = token ? (await authVerifier.verifyAccessToken(token))?.id : undefined;
    } catch {
      socket.data.authUserId = undefined;
    }
    next();
  });
  io.on("connection", (socket) => {
    const address = socket.handshake.address || "unknown";
    activeByAddress.set(address, (activeByAddress.get(address) ?? 0) + 1);
    socket.once("disconnect", () => {
      const active = (activeByAddress.get(address) ?? 1) - 1;
      if (active > 0) activeByAddress.set(address, active);
      else activeByAddress.delete(address);
    });
    registerHandlers(io, socket, authVerifier);
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    const repository = matchRepository as Partial<{ close: () => void }>;
    repository.close?.();
    if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };
  return { httpServer, io, close };
};

export const startServer = async (config: RuntimeConfig): Promise<ServerRuntime> => {
  const runtime = await createServerRuntime(config);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { runtime.httpServer.off("error", onError); reject(error); };
    runtime.httpServer.once("error", onError);
    runtime.httpServer.listen(config.port, () => {
      runtime.httpServer.off("error", onError);
      resolve();
    });
  });
  return runtime;
};
