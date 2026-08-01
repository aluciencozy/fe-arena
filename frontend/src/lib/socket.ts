import { io } from "socket.io-client";

export const socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001", { autoConnect: false, transports: ["websocket", "polling"] });
let disconnectTimer: ReturnType<typeof window.setTimeout> | undefined;
export const connectSocket = () => { if (disconnectTimer) window.clearTimeout(disconnectTimer); if (!socket.connected) socket.connect(); };
export const scheduleSocketDisconnect = () => { if (disconnectTimer) window.clearTimeout(disconnectTimer); disconnectTimer = window.setTimeout(() => { if (!window.location.pathname.startsWith("/room/")) socket.disconnect(); }, 250); };
