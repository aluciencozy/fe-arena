import { Server, Socket } from "socket.io";
import { getUserSession, getPlayersInRoom } from "../services/room.service.js";
import {
  ensureGameForRoom,
  handleGuess,
  setPlayerReady,
  voteToSkipRound,
} from "../services/game.service.js";

export const registerGameHandler = (io: Server, socket: Socket) => {
  const makeEvents = (roomId: string) => ({
    emitState: (state: ReturnType<typeof ensureGameForRoom>) =>
      io.to(roomId).emit("game:state", state),
    emitSystemMessage: (message: string) =>
      io.to(roomId).emit("chat:broadcast", {
        username: "SYSTEM",
        message,
        type: "SYSTEM",
      }),
  });

  socket.on("chat:message", (message: string) => {
    const session = getUserSession(socket.id);

    if (!session) return;

    const { roomId, username } = session;
    const players = getPlayersInRoom(roomId);
    const handledAsGuess = handleGuess(
      roomId,
      username,
      players,
      message,
      makeEvents(roomId),
    );

    if (handledAsGuess) return;

    io.to(roomId).emit("chat:broadcast", { username, message });
  });

  socket.on("game:ready", () => {
    const session = getUserSession(socket.id);

    if (!session) return;

    const { roomId, username } = session;
    const players = getPlayersInRoom(roomId);
    const result = setPlayerReady(roomId, username, players, makeEvents(roomId));

    if (!result.ok) {
      socket.emit("game:error", result.error);
    }
  });

  socket.on("game:skip-vote", () => {
    const session = getUserSession(socket.id);

    if (!session) return;

    const { roomId, username } = session;
    const players = getPlayersInRoom(roomId);
    const result = voteToSkipRound(
      roomId,
      username,
      players,
      makeEvents(roomId),
    );

    if (!result.ok) {
      socket.emit("game:error", result.error);
    }
  });
};
