import { Server, Socket } from "socket.io";
import {
  addPlayerToRoom,
  createRoom,
  getPlayersInRoom,
  getUserSession,
  getRoomMetadata,
  expireReconnectReservation,
  removePlayerFromRoom,
  reservePlayerForReconnect,
  restorePlayerFromReconnect,
} from "../services/room.service.js";
import {
  ensureGameForRoom,
  getGameState,
  handlePlayerDisconnectForGame,
  isJoinAllowedForGame,
  pauseGameForReconnect,
  resumeGameAfterReconnect,
} from "../services/game.service.js";
import {
  getPlayableTitlesForMode,
  getTitlesForTitleIds,
} from "../data/catalog.js";
import { enqueuePlayer, removeFromQueue } from "../services/queue.service.js";
import type { GameDifficulty, GameMode } from "../types/index.js";

const isPlayableMode = (mode: GameMode) => mode === "anime";
const isPlayableDifficulty = (
  difficulty: unknown,
): difficulty is GameDifficulty =>
  difficulty === "standard" || difficulty === "easy";
const RECONNECT_GRACE_MS = 20_000;
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

const joinSocketToRoom = (
  io: Server,
  socket: Socket,
  roomId: string,
  username: string,
) => {
  if (!isJoinAllowedForGame(roomId)) {
    socket.emit("room:error", "This match is already in progress.");
    return false;
  }

  const joinResult = addPlayerToRoom(roomId, username, socket.id);

  if (!joinResult.ok) {
    socket.emit("room:error", joinResult.error);
    return false;
  }

  const { currentPlayers, isNewPlayer, reconnectToken } = joinResult;

  socket.join(roomId);
  io.to(roomId).emit("room:state", currentPlayers);
  io.to(roomId).emit("game:state", ensureGameForRoom(roomId, currentPlayers));
  socket.emit("room:session", { roomId, reconnectToken });

  if (isNewPlayer) {
    socket.to(roomId).emit("room:notification", `${username} has joined!`);
  }

  return true;
};

export const registerRoomHandler = (io: Server, socket: Socket) => {
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
  socket.on(
    "room:create-private",
    ({
      username,
      mode,
      difficulty = "standard",
      selectedTitleIds,
    }: {
      username: string;
      mode: GameMode;
      difficulty?: GameDifficulty;
      selectedTitleIds: string[];
    }) => {
      if (!username || !username.trim()) {
        socket.emit("room:error", "Username is required.");
        return;
      }

      if (!isPlayableMode(mode)) {
        socket.emit("room:error", "This mode is under development.");
        return;
      }

      if (!isPlayableDifficulty(difficulty)) {
        socket.emit("room:error", "That difficulty is not available.");
        return;
      }

      if (!selectedTitleIds || selectedTitleIds.length === 0) {
        socket.emit("room:error", "Select at least one anime.");
        return;
      }

      const selectedTitles = getTitlesForTitleIds(
        mode,
        selectedTitleIds,
        difficulty,
      );
      if (
        selectedTitles.length === 0 ||
        selectedTitles.length !== new Set(selectedTitleIds).size
      ) {
        socket.emit(
          "room:error",
          "Every selected anime must have playable songs for this difficulty.",
        );
        return;
      }

      const metadata = createRoom({
        mode,
        difficulty,
        source: "private",
        selectedTitleIds,
      });
      const normalizedUsername = username.trim();

      if (!joinSocketToRoom(io, socket, metadata.roomId, normalizedUsername)) {
        return;
      }

      socket.emit("room:created", metadata);
    },
  );

  // Listen for the "room:join" event from the client
  socket.on("room:join", (roomId: string, username: string) => {
    if (!roomId || !roomId.trim() || !username || !username.trim()) {
      socket.emit("room:error", "Room ID and username are required.");
      return;
    }

    const normalizedRoomId = roomId.trim().toUpperCase();
    const normalizedUsername = username.trim();

    if (!getRoomMetadata(normalizedRoomId)) {
      socket.emit("room:error", "That room code was not found.");
      return;
    }

    joinSocketToRoom(io, socket, normalizedRoomId, normalizedUsername);
  });

  socket.on(
    "queue:join",
    ({ username, mode, difficulty = "standard" }: {
      username: string;
      mode: GameMode;
      difficulty?: GameDifficulty;
    }) => {
      if (!username || !username.trim()) {
        socket.emit("queue:error", "Username is required.");
        return;
      }

      if (!isPlayableMode(mode)) {
        socket.emit("queue:error", "This mode is under development.");
        return;
      }

      if (!isPlayableDifficulty(difficulty)) {
        socket.emit("queue:error", "That difficulty is not available.");
        return;
      }

      if (getPlayableTitlesForMode(mode, difficulty).length === 0) {
        socket.emit("queue:error", "This mode has no playable songs yet.");
        return;
      }

      const normalizedUsername = username.trim();
      const queueResult = enqueuePlayer(
        socket.id,
        normalizedUsername,
        mode,
        difficulty,
      );

      if (queueResult.status === "waiting") {
        socket.emit("queue:waiting");
        return;
      }

      const opponentSocket = io.sockets.sockets.get(
        queueResult.opponent.socketId,
      );
      if (!opponentSocket) {
        socket.emit("queue:waiting");
        enqueuePlayer(socket.id, normalizedUsername, mode, difficulty);
        return;
      }

      const metadata = createRoom({
        mode,
        difficulty,
        source: "queue",
        selectedTitleIds: [],
      });

      joinSocketToRoom(
        io,
        opponentSocket,
        metadata.roomId,
        queueResult.opponent.username,
      );
      joinSocketToRoom(io, socket, metadata.roomId, normalizedUsername);

      opponentSocket.emit("queue:matched", metadata);
      socket.emit("queue:matched", metadata);
    },
  );

  socket.on("queue:cancel", () => {
    if (removeFromQueue(socket.id)) {
      socket.emit("queue:cancelled");
    }
  });

  socket.on(
    "room:reconnect",
    ({ roomId, reconnectToken }: { roomId: string; reconnectToken: string }) => {
      const normalizedRoomId = roomId.trim().toUpperCase();
      const session = restorePlayerFromReconnect(
        reconnectToken,
        socket.id,
        normalizedRoomId,
      );
      if (!session) {
        socket.emit("room:reconnect-failed");
        return;
      }

      const timer = reconnectTimers.get(reconnectToken);
      if (timer) clearTimeout(timer);
      reconnectTimers.delete(reconnectToken);
      socket.join(normalizedRoomId);
      socket.emit("room:session", { roomId: normalizedRoomId, reconnectToken });
      io.to(normalizedRoomId).emit("room:state", getPlayersInRoom(normalizedRoomId));
      resumeGameAfterReconnect(normalizedRoomId, makeEvents(normalizedRoomId));
      const state = getGameState(normalizedRoomId);
      if (state) io.to(normalizedRoomId).emit("game:state", state);
    },
  );

  socket.on("room:leave", () => {
    const removalResult = removePlayerFromRoom(socket.id);
    if (!removalResult) return;
    const { roomId, username, updatedPlayers } = removalResult;
    socket.leave(roomId);
    io.to(roomId).emit("room:state", updatedPlayers);
    handlePlayerDisconnectForGame(roomId, username, updatedPlayers, makeEvents(roomId));
  });

  // Listen for the "disconnect" event when a user leaves the room
  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const session = getUserSession(socket.id);
    const gameState = session ? getGameState(session.roomId) : undefined;
    const reconnectable = gameState && ["COUNTDOWN", "PLAYING", "GRACE_PERIOD", "REVEAL"].includes(gameState.phase);

    if (session && reconnectable) {
      if (gameState.connectionPause) {
        const removal = removePlayerFromRoom(socket.id);
        if (!removal) return;
        io.to(removal.roomId).emit("room:state", removal.updatedPlayers);
        handlePlayerDisconnectForGame(
          removal.roomId,
          removal.username,
          removal.updatedPlayers,
          makeEvents(removal.roomId),
        );
        return;
      }
      const reservation = reservePlayerForReconnect(socket.id);
      if (!reservation) return;
      const expiresAt = Date.now() + RECONNECT_GRACE_MS;
      const paused = pauseGameForReconnect(
        reservation.roomId,
        reservation.username,
        expiresAt,
        makeEvents(reservation.roomId),
      );
      if (!paused) {
        const removal = expireReconnectReservation(reservation.reconnectToken);
        if (removal) {
          handlePlayerDisconnectForGame(
            removal.roomId,
            removal.username,
            removal.updatedPlayers,
            makeEvents(removal.roomId),
          );
        }
        return;
      }
      reconnectTimers.set(
        reservation.reconnectToken,
        setTimeout(() => {
          reconnectTimers.delete(reservation.reconnectToken);
          const removal = expireReconnectReservation(reservation.reconnectToken);
          if (!removal) return;
          io.to(removal.roomId).emit("room:state", removal.updatedPlayers);
          handlePlayerDisconnectForGame(
            removal.roomId,
            removal.username,
            removal.updatedPlayers,
            makeEvents(removal.roomId),
          );
        }, RECONNECT_GRACE_MS),
      );
      return;
    }

    const removalResult = removePlayerFromRoom(socket.id);

    if (!removalResult) return; // If there's no session for the socket, do nothing

    const { roomId, username, updatedPlayers } = removalResult;

    // Emit the updated state of the room and a notification to all users in the room
    io.to(roomId).emit("room:state", updatedPlayers);
    io.to(roomId).emit("room:notification", `${username} has left!`);
    handlePlayerDisconnectForGame(roomId, username, updatedPlayers, makeEvents(roomId));
  });
};
