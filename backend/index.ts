import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { registerRoomHandler } from './src/sockets/room.handlers.js';

const app = express();
app.use(cors()); // Allows standard REST API requests

const httpServer = createServer(app);

// Initialize Socket.io and configure CORS specifically for WebSockets
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Vite frontend URL
    methods: ["GET", "POST"]
  }
});

// Listen for incoming connections
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Register room-related handlers
  registerRoomHandler(io, socket);

  // Listen for disconnections
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});