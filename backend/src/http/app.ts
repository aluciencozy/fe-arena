import cors from "cors";
import express, { type Express } from "express";
import { TOPICS } from "../../../shared/domain.js";
import { questionBankStats } from "../services/question-bank.service.js";
import { getAccountHistory } from "../services/account-history.service.js";
import { createAuthVerifier, verifyBearerHeader, type AuthVerifier } from "../services/auth.service.js";
import type { AccountHistoryRepository } from "../persistence/match.repository.js";

export type AppOptions = {
  frontendOrigin?: string;
  authVerifier?: AuthVerifier;
  accountHistoryRepository?: AccountHistoryRepository;
};

export const createApp = (options: AppOptions = {}): Express => {
  const frontendOrigin = options.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  const authVerifier = options.authVerifier ?? createAuthVerifier();
  const historyRepository = options.accountHistoryRepository;
  const app = express();
  app.use(cors({ origin: frontendOrigin }));
  app.get("/", (_request, response) => response.json({ name: "FE Arena", disclaimer: "Unofficial study tool; not affiliated with UCF." }));
  app.get("/api/topics", (_request, response) => response.json({ topics: TOPICS }));
  app.get("/api/question-bank", (_request, response) => response.json({ ...questionBankStats(), provenance: "Original content informed by public reference materials; answers are never exposed by this endpoint." }));
  app.get("/api/account/history", async (request, response) => {
    response.set("Cache-Control", "no-store");
    const identity = await verifyBearerHeader(authVerifier, request.header("authorization"));
    if (!identity) return response.status(401).json({ code: "AUTH_REQUIRED", message: "Sign in to view account history." });
    try {
      const history = historyRepository
        ? await historyRepository.getAccountHistory(identity.id)
        : await getAccountHistory(identity.id);
      return response.json(history);
    } catch {
      return response.status(503).json({ code: "HISTORY_UNAVAILABLE", message: "Account history is temporarily unavailable." });
    }
  });
  return app;
};
