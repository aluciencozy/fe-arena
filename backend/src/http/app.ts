import cors from "cors";
import express, { type Express, type ErrorRequestHandler } from "express";
import { TOPICS } from "../../../shared/domain.js";
import { isQuestionBankReady, questionBankStats } from "../services/question-bank.service.js";
import { getAccountHistory } from "../services/account-history.service.js";
import { createAuthVerifier, verifyBearerHeader, type AuthVerifier } from "../services/auth.service.js";
import type { AccountHistoryRepository } from "../persistence/match.repository.js";
import { createIpRateLimit, isAllowedOrigin, securityHeaders } from "../security.js";
import type { RuntimeConfig } from "../config.js";

export type PersistenceReadiness = {
  configured: boolean;
  mode: "supabase" | "in-memory-fallback";
  /** True when the configured persistence path completed startup initialization. */
  ready: boolean;
  outbox: "not-configured" | "starting" | "ready" | "degraded";
  readiness?: () => { status: "starting" | "ready" | "degraded" };
};
export type QuestionBankReadiness = {
  ready: boolean;
  mode: "supabase" | "in-memory-fallback";
  publishedQuestions: number;
};

export type AppOptions = {
  frontendOrigin?: string;
  frontendOrigins?: readonly string[];
  runtimeConfig?: Pick<RuntimeConfig, "frontendOrigins" | "trustProxy" | "isProduction">;
  authVerifier?: AuthVerifier;
  accountHistoryRepository?: AccountHistoryRepository;
  persistence?: Partial<PersistenceReadiness> & Pick<PersistenceReadiness, "configured" | "mode" | "ready">;
  questionBank?: QuestionBankReadiness;
};

export const createApp = (options: AppOptions = {}): Express => {
  const runtime = options.runtimeConfig;
  const allowedOrigins =
    options.frontendOrigins ??
    runtime?.frontendOrigins ??
    (options.frontendOrigin ? [options.frontendOrigin] : [process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"]);
  const production = runtime?.isProduction ?? process.env.NODE_ENV === "production";
  const persistence = {
    configured: false,
    mode: "in-memory-fallback" as const,
    ready: true,
    outbox: "not-configured" as const,
    ...options.persistence,
  };
  const defaultQuestionBankStats = questionBankStats();
  const questionBank = options.questionBank ?? {
    ready: isQuestionBankReady(),
    mode: "in-memory-fallback" as const,
    publishedQuestions: defaultQuestionBankStats.total,
  };
  const authVerifier = options.authVerifier ?? createAuthVerifier();
  const historyRepository = options.accountHistoryRepository;
  const app = express();
  if (runtime) app.set("trust proxy", runtime.trustProxy);
  app.disable("x-powered-by");
  app.use(securityHeaders(production));
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin, allowedOrigins, production)),
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  // Health checks are intentionally cheap and unauthenticated. Other public entry points are bounded by IP.
  app.get("/healthz", (_request, response) => response.status(200).json({ status: "ok" }));
  app.get("/readyz", (_request, response) => {
    const outboxStatus = persistence.readiness?.().status ?? persistence.outbox;
    const persistenceStatus = persistence.ready ? (persistence.configured ? "configured" : "fallback") : "unavailable";
    const questionBankStatus = questionBank.ready ? "ready" : "unavailable";
    const outboxReady = persistence.configured ? outboxStatus === "ready" : outboxStatus === "not-configured";
    const ready = questionBank.ready && persistence.ready && outboxReady && (persistence.configured || !production);
    return response.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      liveness: { status: "ok" },
      questionBank: {
        status: questionBankStatus,
        mode: questionBank.mode,
        publishedQuestions: questionBank.publishedQuestions,
      },
      persistence: {
        status: persistenceStatus,
        configured: persistence.configured,
        guestGameplay: true,
        outbox: outboxStatus,
      },
    });
  });
  app.use("/api", createIpRateLimit(120, 60_000));
  app.get("/", (_request, response) =>
    response.json({ name: "FE Arena", disclaimer: "Unofficial study tool; not affiliated with UCF." }),
  );
  app.get("/api/topics", (_request, response) => response.json({ topics: TOPICS }));
  app.get("/api/question-bank", (_request, response) =>
    response.json({
      ...questionBankStats(),
      provenance:
        "Original content informed by public reference materials; answers are never exposed by this endpoint.",
    }),
  );
  app.get("/api/account/history", async (request, response) => {
    response.set("Cache-Control", "no-store");
    const identity = await verifyBearerHeader(authVerifier, request.header("authorization"));
    if (!identity)
      return response.status(401).json({ code: "AUTH_REQUIRED", message: "Sign in to view account history." });
    try {
      const history = historyRepository
        ? await historyRepository.getAccountHistory(identity.id)
        : await getAccountHistory(identity.id);
      return response.json(history);
    } catch {
      return response
        .status(503)
        .json({ code: "HISTORY_UNAVAILABLE", message: "Account history is temporarily unavailable." });
    }
  });
  const safeErrors: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error && typeof error === "object" && "status" in error && error.status === 413)
      return response.status(413).json({ code: "REQUEST_TOO_LARGE", message: "Request body is too large." });
    if (error instanceof SyntaxError && "body" in error)
      return response.status(400).json({ code: "INVALID_JSON", message: "Request JSON is invalid." });
    return response
      .status(error?.message === "Not allowed by CORS" ? 403 : 500)
      .json({ code: "REQUEST_FAILED", message: "The request could not be completed." });
  };
  app.use(safeErrors);
  return app;
};
