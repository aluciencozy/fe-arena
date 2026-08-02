import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./src/http/app.js";
import { createMatchRepository } from "./src/persistence/index.js";
import { setAccountHistoryRepository } from "./src/services/account-history.service.js";
import { createAuthVerifier } from "./src/services/auth.service.js";
import { loadQuestionRepository, setQuestionRepository } from "./src/services/question-bank.service.js";
import { setMatchRepository } from "./src/services/match.service.js";
import { registerHandlers } from "./src/sockets/handlers.js";

const matchRepository = createMatchRepository();
setMatchRepository(matchRepository);
setAccountHistoryRepository(matchRepository);
setQuestionRepository(await loadQuestionRepository());
const authVerifier = createAuthVerifier();
const app = createApp({ authVerifier, accountHistoryRepository: matchRepository });

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173", methods: ["GET", "POST"] } });
io.use(async (socket, next) => {
  const token = typeof socket.handshake.auth?.accessToken === "string" ? socket.handshake.auth.accessToken : "";
  // Invalid/missing auth never blocks guest play. It simply leaves this socket
  // anonymous; protected HTTP reads still return 401.
  try {
    socket.data.authUserId = token ? (await authVerifier.verifyAccessToken(token))?.id : undefined;
  } catch {
    socket.data.authUserId = undefined;
  }
  next();
});
io.on("connection", (socket) => registerHandlers(io, socket, authVerifier));

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => console.log(`FE Arena server listening on http://localhost:${port}`));
