import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UnifiedMessage, GameState } from "../types/";
import { useGameStateStore } from "@/store/gameStore";
import { connectSocket, scheduleSocketDisconnect, socket } from "@/lib/socket";

const MAX_MESSAGE_CAPACITY = 100; // Maximum number of messages to keep in state

export const useSocket = (roomCode: string, playerName: string) => {
  const [players, setPlayers] = useState<string[]>([]); // State to hold the current players in room
  const [messages, setMessages] = useState<UnifiedMessage[]>([]); // State to hold chat messages
  const [errorNotice, setErrorNotice] = useState("");
  const [guessCooldownEndsAt, setGuessCooldownEndsAt] = useState(0);
  const navigate = useNavigate(); // Hook to programmatically navigate between routes

  useEffect(() => {
    if (!roomCode || !playerName) return;

    connectSocket(); // Manually connect the socket

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
      setErrorNotice("");
      setPlayers(roomPlayers);
    };

    // Handler function to handle room errors, such as when joining fails
    const handleRoomError = (errorMessage: string) => {
      setErrorNotice(errorMessage);
      navigate("/", { state: { notice: errorMessage } }); // Redirect to home page on error
    };

    // Handler function to update chatMessages state when a 'chat:broadcast' event is received
    const handleChatBroadcast = ({
      username,
      message,
      type,
    }: {
      username: string;
      message: string;
      type?: "USER" | "SYSTEM";
    }) => {
      if (message.trim() === "") return; // Do not add empty user messages to chat

      const chatMessage: UnifiedMessage = {
        id: `${Date.now()}-${Math.random()}`, // Generate a unique ID for the message
        type: type || "USER", // Default to "USER" type if not provided
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

    const handleGameError = (errorMessage: string) => {
      setErrorNotice(errorMessage);
    };
    const handleGuessCooldown = (endsAt: number) => {
      setGuessCooldownEndsAt(endsAt);
    };

    // Listen for relevant events from the server
    socket.on("room:notification", handleRoomNotification);
    socket.on("room:state", handleRoomState);
    socket.on("room:error", handleRoomError);
    socket.on("chat:broadcast", handleChatBroadcast);
    socket.on("game:state", handleGameState);
    socket.on("game:error", handleGameError);
    socket.on("guess:cooldown", handleGuessCooldown);

    // Remove event listeners and disconnect after a short grace period.
    // React StrictMode remounts effects in development; delaying prevents
    // deleting a freshly matched room between the probe unmount/remount.
    return () => {
      socket.off("room:notification", handleRoomNotification);
      socket.off("room:state", handleRoomState);
      socket.off("room:error", handleRoomError);
      socket.off("chat:broadcast", handleChatBroadcast);
      socket.off("game:state", handleGameState);
      socket.off("game:error", handleGameError);
      socket.off("guess:cooldown", handleGuessCooldown);
      scheduleSocketDisconnect();
    };
  }, [navigate, roomCode, playerName]); // Re-run effect if roomCode or playerName changes

  const sendChatMessage = (message: string, enforceGuessCooldown = false) => {
    const trimmedMessage = message.trim();
    if (
      !trimmedMessage ||
      (enforceGuessCooldown && Date.now() < guessCooldownEndsAt)
    ) {
      return false;
    }
    socket.emit("chat:message", trimmedMessage);
    if (enforceGuessCooldown) setGuessCooldownEndsAt(Date.now() + 2500);
    return true;
  };

  const setReady = () => {
    socket.emit("game:ready");
  };

  const voteToSkip = () => {
    socket.emit("game:skip-vote");
  };

  return {
    players,
    messages,
    errorNotice,
    guessCooldownEndsAt,
    sendChatMessage,
    setReady,
    voteToSkip,
  };
};
