import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

// Create a Socket.io client instance with autoConnect set to false
const socket: Socket = io("http://localhost:3001", { autoConnect: false });

export const useSocket = (roomCode: string, playerName: string) => {
  const [notifications, setNotifications] = useState<string[]>([]); // State to hold room notifications
  const [players, setPlayers] = useState<string[]>([]); // State to hold the current players in room

  useEffect(() => {
    socket.connect(); // Manually connect the socket

    // Immediately emit the 'room:join' event to join the specified room with the player's name
    socket.emit("room:join", roomCode, playerName);

    // Handler function to process incoming room notifications
    const handleRoomNotification = (notification: string) => {
      setNotifications((prevNotifications) => [
        ...prevNotifications,
        notification,
      ]);
    };

    const handleRoomState = (roomPlayers: string[]) => {
      setPlayers(roomPlayers);
    };

    // Listen for the 'room:notification' and 'room:state' events from the server
    socket.on("room:notification", handleRoomNotification);
    socket.on("room:state", handleRoomState);

    // Remove event listeners and disconnect the socket
    return () => {
      socket.off("room:notification", handleRoomNotification);
      socket.off("room:state", handleRoomState);
      socket.disconnect();
    };
  }, [roomCode, playerName]); // Re-run effect if roomCode or playerName changes

  return { notifications, players };
};
