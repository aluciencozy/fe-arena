import { Server, Socket } from "socket.io";
import {
  addPlayerToRoom,
  removePlayerFromRoom,
} from "../services/room.service.js";
import {
  ensureGameForRoom,
  handlePlayerDisconnectForGame,
  isJoinAllowedForGame,
} from "../services/game.service.js";

export const registerRoomHandler = (io: Server, socket: Socket) => {
  // Listen for the "room:join" event from the client
  socket.on("room:join", (roomId: string, username: string) => {
    if (!roomId || !roomId.trim() || !username || !username.trim()) {
      socket.emit("room:error", "Room ID and username are required.");
      return;
    }

    const normalizedRoomId = roomId.trim().toUpperCase();
    const normalizedUsername = username.trim();

    if (!isJoinAllowedForGame(normalizedRoomId)) {
      socket.emit("room:error", "This match is already in progress.");
      return;
    }

    // Add the player to the room and get the current players in the room
    const joinResult = addPlayerToRoom(
      normalizedRoomId,
      normalizedUsername,
      socket.id,
    );

    if (!joinResult.ok) {
      socket.emit("room:error", joinResult.error);
      return;
    }

    const { currentPlayers, isNewPlayer } = joinResult;

    if (joinResult.replacedSocketId) {
      const replacedSocket = io.sockets.sockets.get(joinResult.replacedSocketId);
      replacedSocket?.leave(normalizedRoomId);
      replacedSocket?.disconnect(true);
    }

    socket.join(normalizedRoomId); // Put the socket in the specified room

    // Emit the current state of the room to all users in the room
    io.to(normalizedRoomId).emit("room:state", currentPlayers);
    io.to(normalizedRoomId).emit(
      "game:state",
      ensureGameForRoom(normalizedRoomId, currentPlayers),
    );

    // If the player is new to the room, emit a notification to all users in the room
    if (isNewPlayer) {
      socket
        .to(normalizedRoomId)
        .emit("room:notification", `${normalizedUsername} has joined!`);
    }
  });

  // Listen for the "disconnect" event when a user leaves the room
  socket.on("disconnect", () => {
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
