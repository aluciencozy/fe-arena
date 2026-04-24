import { Server, Socket } from "socket.io";
import {
  addPlayerToRoom,
  removePlayerFromRoom,
} from "../services/room.service.js";

export const registerRoomHandler = (io: Server, socket: Socket) => {
  // Listen for the "room:join" event from the client
  socket.on("room:join", (roomId: string, username: string) => {
    if (!roomId || !roomId.trim() || !username || !username.trim()) {
      socket.emit("room:error", "Room ID and username are required.");
      return;
    }

    socket.join(roomId); // Put the socket in the specified room

    // Add the player to the room and get the current players in the room
    const { currentPlayers, isNewPlayer } = addPlayerToRoom(
      roomId,
      username,
      socket.id,
    );

    // Emit the current state of the room to all users in the room
    io.to(roomId).emit("room:state", currentPlayers);

    // If the player is new to the room, emit a notification to all users in the room
    if (isNewPlayer) {
      socket.to(roomId).emit("room:notification", `${username} has joined!`);
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
  });
};
