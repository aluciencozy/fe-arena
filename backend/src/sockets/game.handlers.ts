import { Server, Socket } from "socket.io";
import { getUserSession } from "../services/room.service.js";

export const registerGameHandler = (io: Server, socket: Socket) => {
  socket.on("chat:message", (message: string) => {
    const session = getUserSession(socket.id);

    if (!session) return; // If there's no session for the socket, do nothing

    const { roomId, username } = session;

    // Broadcast the chat message to all users in the room, including the sender
    io.to(roomId).emit("chat:broadcast", { username, message });
  });
};
