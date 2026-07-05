import { Server, Socket } from "socket.io";
import {
  addPlayerToRoom,
  createRoom,
  getRoomMetadata,
  removePlayerFromRoom,
} from "../services/room.service.js";
import {
  ensureGameForRoom,
  handlePlayerDisconnectForGame,
  isJoinAllowedForGame,
} from "../services/game.service.js";
import { getTracksForMode, getTracksForTitleIds } from "../data/catalog.js";
import { enqueuePlayer, removeFromQueue } from "../services/queue.service.js";
import type { GameMode } from "../types/index.js";

const isPlayableMode = (mode: GameMode) => mode === "anime";

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

  const { currentPlayers, isNewPlayer } = joinResult;

  socket.join(roomId);
  io.to(roomId).emit("room:state", currentPlayers);
  io.to(roomId).emit("game:state", ensureGameForRoom(roomId, currentPlayers));

  if (isNewPlayer) {
    socket.to(roomId).emit("room:notification", `${username} has joined!`);
  }

  return true;
};

export const registerRoomHandler = (io: Server, socket: Socket) => {
  socket.on(
    "room:create-private",
    ({
      username,
      mode,
      selectedTitleIds,
    }: {
      username: string;
      mode: GameMode;
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

      if (!selectedTitleIds || selectedTitleIds.length === 0) {
        socket.emit("room:error", "Select at least one anime.");
        return;
      }

      const playlist = getTracksForTitleIds(mode, selectedTitleIds);
      if (playlist.length === 0) {
        socket.emit("room:error", "The selected anime have no playable songs.");
        return;
      }

      const metadata = createRoom({
        mode,
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
    ({ username, mode }: { username: string; mode: GameMode }) => {
      if (!username || !username.trim()) {
        socket.emit("queue:error", "Username is required.");
        return;
      }

      if (!isPlayableMode(mode)) {
        socket.emit("queue:error", "This mode is under development.");
        return;
      }

      if (getTracksForMode(mode).length === 0) {
        socket.emit("queue:error", "This mode has no playable songs yet.");
        return;
      }

      const normalizedUsername = username.trim();
      const queueResult = enqueuePlayer(socket.id, normalizedUsername, mode);

      if (queueResult.status === "waiting") {
        socket.emit("queue:waiting");
        return;
      }

      const metadata = createRoom({
        mode,
        source: "queue",
        selectedTitleIds: [],
      });

      const opponentSocket = io.sockets.sockets.get(
        queueResult.opponent.socketId,
      );
      if (!opponentSocket) {
        socket.emit("queue:waiting");
        enqueuePlayer(socket.id, normalizedUsername, mode);
        return;
      }

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

  // Listen for the "disconnect" event when a user leaves the room
  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const removalResult = removePlayerFromRoom(socket.id);

    if (!removalResult) return; // If there's no session for the socket, do nothing

    const { roomId, username, updatedPlayers } = removalResult;

    // Emit the updated state of the room and a notification to all users in the room
    io.to(roomId).emit("room:state", updatedPlayers);
    io.to(roomId).emit("room:notification", `${username} has left!`);
    handlePlayerDisconnectForGame(roomId, username, updatedPlayers, {
      emitState: (state) => io.to(roomId).emit("game:state", state),
      emitSystemMessage: (message) =>
        io.to(roomId).emit("chat:broadcast", {
          username: "SYSTEM",
          message,
          type: "SYSTEM",
        }),
    });
  });
};
