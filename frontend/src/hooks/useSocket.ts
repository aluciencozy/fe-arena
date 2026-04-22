import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { ChatMessage } from "../types/";

// Create a Socket.io client instance with autoConnect set to false
const socket: Socket = io("http://localhost:3001", { autoConnect: false });

export const useSocket = (roomCode: string, playerName: string) => {
  const [notifications, setNotifications] = useState<string[]>([]); // State to hold room notifications
  const [players, setPlayers] = useState<string[]>([]); // State to hold the current players in room
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]); // State to hold chat messages

  useEffect(() => {
    socket.connect(); // Manually connect the socket

    // Immediately emit the 'room:join' event to join the specified room with the player's name
    socket.emit("room:join", roomCode, playerName);

    // Handler function to update notifications state when a 'room:notification' event is received
    const handleRoomNotification = (notification: string) => {
      setNotifications((prevNotifications) => [
        ...prevNotifications,
        notification,
      ]);
    };

    // Handler function to update players state when a 'room:state' event is received
    const handleRoomState = (roomPlayers: string[]) => {
      setPlayers(roomPlayers);
    };

    // Handler function to update chatMessages state when a 'chat:broadcast' event is received
    const handleChatBroadcast = (message: ChatMessage) => {
      setChatMessages((prevMessages) => [...prevMessages, message]);
    };

    // Listen for the 'room:notification' and 'room:state' events from the server
    socket.on("room:notification", handleRoomNotification);
    socket.on("room:state", handleRoomState);
    socket.on("chat:broadcast", handleChatBroadcast);

    // Remove event listeners and disconnect the socket
    return () => {
      socket.off("room:notification", handleRoomNotification);
      socket.off("room:state", handleRoomState);
      socket.off("chat:broadcast", handleChatBroadcast);
      socket.disconnect();
    };
  }, [roomCode, playerName]); // Re-run effect if roomCode or playerName changes

  const sendChatMessage = (message: string) => {
    if (!message.trim()) return; // Do not send empty messages
    socket.emit("chat:message", message);
  };

  return { notifications, players, chatMessages, sendChatMessage };
};
