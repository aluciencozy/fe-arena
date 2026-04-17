import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Create a Socket.io client instance with autoConnect set to false
const socket: Socket = io('http://localhost:3001', { autoConnect: false });

export const useSocket = () => {
  // State to hold messages from the server
  const [serverMessage, setServerMessage] = useState<string>('');

  useEffect(() => {
    socket.connect(); // Manually connect the socket

    // What to do when a message is received from the server
    const handleServerMessage = (message: string) => {
      setServerMessage(message); // Update state with the message from the server
    }

    // Listen for the 'welcome' event from the server
    socket.on('welcome', handleServerMessage);

    // Cleanup function to disconnect the socket when the component unmounts
    return () => {
      socket.off('welcome', handleServerMessage); // Remove the event listener
      socket.disconnect(); // Disconnect the socket
    }
  }, [])

  return { serverMessage };
};