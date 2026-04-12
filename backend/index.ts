// backend/index.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors()); // Allows standard REST API requests

const server = createServer(app);

// Initialize Socket.io and configure CORS specifically for WebSockets
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Your Vite frontend URL
    methods: ["GET", "POST"]
  }
});

// Listen for incoming connections
io.on('connection', (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  // Send a welcome message strictly to the person who just connected
  socket.emit('welcome', 'Hello from the WebSocket server!');

  // Listen for disconnections
  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});