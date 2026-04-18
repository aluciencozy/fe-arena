import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Create a Socket.io client instance with autoConnect set to false
const socket: Socket = io('http://localhost:3001', { autoConnect: false });

export const useSocket = (roomCode: string, playerName: string) => {
  // State to hold room events from the server
  const [notifications, setNotifications] = useState<string[]>([]);

  useEffect(() => {
    socket.connect(); // Manually connect the socket

    // Immediately emit the 'room:join' event to join the specified room with the player's name
    socket.emit('room:join', roomCode, playerName);

    // Handler function to process incoming room notifications
    const handleRoomNotification = (notification: string) => {
      // Update state, append new notification to the list of room events
      setNotifications((prevNotifications) => [...prevNotifications, notification]);
    }

    // Listen for the 'room:notification' event from the server
    socket.on('room:notification', handleRoomNotification);

    // Cleanup function to disconnect the socket when the component unmounts
    return () => {
      socket.off('room:notification', handleRoomNotification); // Remove the event listener
      socket.disconnect(); // Disconnect the socket
    }
  }, [roomCode, playerName]); // Re-run effect if roomCode or playerName changes

  return { notifications };
}