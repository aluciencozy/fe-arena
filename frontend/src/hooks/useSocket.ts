import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import type { UnifiedMessage, GameState } from "../types/";
import { useGameStateStore } from "@/store/gameStore";

const MAX_MESSAGE_CAPACITY = 100; // Maximum number of messages to keep in state

// Create a Socket.io client instance with autoConnect set to false
const socket: Socket = io("http://localhost:3001", { autoConnect: false });

export const useSocket = (roomCode: string, playerName: string) => {
  const [players, setPlayers] = useState<string[]>([]); // State to hold the current players in room
  const [messages, setMessages] = useState<UnifiedMessage[]>([]); // State to hold chat messages
  const navigate = useNavigate(); // Hook to programmatically navigate between routes

  useEffect(() => {
    socket.connect(); // Manually connect the socket

    // Immediately emit the 'room:join' event to join the specified room with the player's name
    socket.emit("room:join", roomCode, playerName);

    // Handler function to update notifications state when a 'room:notification' event is received
    const handleRoomNotification = (notification: string) => {
      const message: UnifiedMessage = {
        id: `${Date.now()}-${Math.random()}`, // Generate a unique ID for the message
        type: "SYSTEM",
        text: notification,
        timestamp: Date.now(),
      };
      setMessages((prevMessages) =>
        [...prevMessages, message].slice(-MAX_MESSAGE_CAPACITY),
      );
    };

    // Handler function to update players state when a 'room:state' event is received
    const handleRoomState = (roomPlayers: string[]) => {
      setPlayers(roomPlayers);
    };

    // Handler function to handle room errors, such as when joining fails
    const handleRoomError = (errorMessage: string) => {
      alert(`Error: ${errorMessage}`);
      navigate("/"); // Redirect to home page on error
    };

    // Handler function to update chatMessages state when a 'chat:broadcast' event is received
    const handleChatBroadcast = ({
      username,
      message,
    }: {
      username: string;
      message: string;
    }) => {
      const chatMessage: UnifiedMessage = {
        id: `${Date.now()}-${Math.random()}`, // Generate a unique ID for the message
        type: "USER",
        sender: username,
        text: message,
        timestamp: Date.now(),
      };
      setMessages((prevMessages) =>
        [...prevMessages, chatMessage].slice(-MAX_MESSAGE_CAPACITY),
      );
    };

    const handleGameState = (gameState: GameState) => {
      useGameStateStore.getState().setGameState(gameState);
    };

    // Listen for relevant events from the server
    socket.on("room:notification", handleRoomNotification);
    socket.on("room:state", handleRoomState);
    socket.on("room:error", handleRoomError);
    socket.on("chat:broadcast", handleChatBroadcast);
    socket.on("game:state", handleGameState);

    // Remove event listeners and disconnect the socket
    return () => {
      socket.off("room:notification", handleRoomNotification);
      socket.off("room:state", handleRoomState);
      socket.off("room:error", handleRoomError);
      socket.off("chat:broadcast", handleChatBroadcast);
      socket.off("game:state", handleGameState);
      socket.disconnect();
    };
  }, [roomCode, playerName]); // Re-run effect if roomCode or playerName changes

  const sendChatMessage = (message: string) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return; // Do not send empty messages
    socket.emit("chat:message", trimmedMessage);
  };

  const startGame = (roomId: string) => {
    socket.emit("game:start", roomId);
  };

  return { players, messages, sendChatMessage, startGame };
};
