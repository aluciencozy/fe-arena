import { Server, Socket } from "socket.io";

export const registerRoomHandler = (io: Server, socket: Socket) => {
  // Listen for the "room:join" event from the client
  socket.on("room:join", (roomId: string, username: string) => {
    // Put the socket in the specified room
    socket.join(roomId);

    // Notify other users in the room that a new user has joined
    socket.to(roomId).emit("room:notification", `${username} has joined!`);
  });
};