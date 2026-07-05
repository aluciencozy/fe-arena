import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";
let pendingDisconnect: number | undefined;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
});

export const connectSocket = () => {
  if (pendingDisconnect) {
    window.clearTimeout(pendingDisconnect);
    pendingDisconnect = undefined;
  }

  socket.connect();
};

export const scheduleSocketDisconnect = () => {
  if (pendingDisconnect) {
    window.clearTimeout(pendingDisconnect);
  }

  pendingDisconnect = window.setTimeout(() => {
    socket.disconnect();
    pendingDisconnect = undefined;
  }, 250);
};
