import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { TOPICS } from "../shared/domain.js";
import { questionBankStats } from "./src/services/question-bank.service.js";
import { createMatchRepository } from "./src/persistence/index.js";
import { setMatchRepository } from "./src/services/match.service.js";
import { registerHandlers } from "./src/sockets/handlers.js";

setMatchRepository(createMatchRepository());

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
app.get("/", (_request, response) => response.json({ name: "FE Arena", disclaimer: "Unofficial study tool; not affiliated with UCF." }));
app.get("/api/topics", (_request, response) => response.json({ topics: TOPICS }));
app.get("/api/question-bank", (_request, response) => response.json({ ...questionBankStats(), provenance: "Original content informed by public reference materials; answers are never exposed by this endpoint." }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173", methods: ["GET", "POST"] } });
io.on("connection", (socket) => registerHandlers(io, socket));

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => console.log(`FE Arena server listening on http://localhost:${port}`));
