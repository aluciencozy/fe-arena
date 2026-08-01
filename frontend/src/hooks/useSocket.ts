import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket, scheduleSocketDisconnect, socket } from "@/lib/socket";
import { clearStoredToken, storedTokenForRoom, useGameStore } from "@/store/gameStore";
import type { ChatMessage, MatchPublicState, RoomState } from "@/types";

export const useArenaSocket = (roomId: string, playerName: string) => {
  const navigate = useNavigate();
  const setRoom = useGameStore((state) => state.setRoom);
  const setMatch = useGameStore((state) => state.setMatch);
  const setSession = useGameStore((state) => state.setSession);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorNotice, setErrorNotice] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastSubmission, setLastSubmission] = useState<{ correct: boolean; total: number } | null>(null);

  useEffect(() => {
    if (!roomId || !playerName) return;
    const addMessage = (incoming: Omit<ChatMessage, "id">) => setMessages((current) => [...current, { ...incoming, id: `${incoming.sentAt}-${Math.random()}` }].slice(-80));
    const join = () => {
      setConnection("connecting");
      const token = storedTokenForRoom(roomId);
      if (token) socket.emit("room:reconnect", { roomId, reconnectToken: token });
      else socket.emit("room:join", { roomId, username: playerName });
    };
    const onConnect = () => join();
    const onDisconnect = () => setConnection("disconnected");
    const onSession = (payload: { roomId: string; seatId: string; reconnectToken: string }) => { if (payload.roomId === roomId) { setSession(payload.seatId, payload.reconnectToken, roomId); setConnection("connected"); } };
    const onRoom = (state: RoomState) => { if (state.metadata.roomId === roomId) { setRoom(state); setConnection("connected"); } };
    const onMatch = (state: MatchPublicState) => { if (state.roomId === roomId) setMatch(state); };
    const onChat = (message: Omit<ChatMessage, "id">) => addMessage(message);
    const onError = (payload: { message?: string } | string) => setErrorNotice(typeof payload === "string" ? payload : payload.message ?? "Something went wrong.");
    const onReconnectFailed = (payload?: { message?: string }) => { clearStoredToken(roomId); setErrorNotice(payload?.message ?? "The guest seat expired. The match ended safely."); setTimeout(() => navigate("/", { replace: true }), 1800); };
    const onAck = (payload: { correct: boolean; score: { total: number } }) => setLastSubmission({ correct: payload.correct, total: payload.score.total });
    socket.on("connect", onConnect); socket.on("disconnect", onDisconnect); socket.on("room:session", onSession); socket.on("room:state", onRoom); socket.on("match:state", onMatch); socket.on("chat:message", onChat); socket.on("server:error", onError); socket.on("room:reconnect-failed", onReconnectFailed); socket.on("match:submission-ack", onAck);
    connectSocket();
    if (socket.connected) join();
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("room:session", onSession); socket.off("room:state", onRoom); socket.off("match:state", onMatch); socket.off("chat:message", onChat); socket.off("server:error", onError); socket.off("room:reconnect-failed", onReconnectFailed); socket.off("match:submission-ack", onAck); scheduleSocketDisconnect(); };
  }, [navigate, playerName, roomId, setMatch, setRoom, setSession]);

  return {
    messages, errorNotice, connection, lastSubmission,
    clearSubmission: () => setLastSubmission(null),
    sendChat: (message: string) => { if (message.trim()) socket.emit("chat:send", { message }); },
    configure: (config: unknown) => socket.emit("match:configure", config),
    ready: () => socket.emit("match:ready"),
    submit: (answer: unknown) => socket.emit("match:submit", answer),
    rematch: () => socket.emit("match:rematch"),
    leave: () => { clearStoredToken(roomId); socket.emit("room:leave"); },
  };
};
