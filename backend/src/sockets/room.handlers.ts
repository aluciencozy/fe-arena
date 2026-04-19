import { Server, Socket } from "socket.io";
import { addPlayerToRoom } from "../services/room.service.js";

export const registerRoomHandler = (io: Server, socket: Socket) => {
  // Listen for the "room:join" event from the client
  socket.on("room:join", (roomId: string, username: string) => {
    socket.join(roomId); // Put the socket in the specified room

    // Add the player to the room and get the current players in the room
    const { currentPlayers, isNewPlayer } = addPlayerToRoom(roomId, username);

    // Emit the current state of the room to all users in the room
    io.to(roomId).emit("room:state", currentPlayers);

    // If the player is new to the room, emit a notification to all users in the room
    if (isNewPlayer) {
      socket.to(roomId).emit("room:notification", `${username} has joined!`);
    }
  });
};