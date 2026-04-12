// frontend/src/App.tsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// Connect to the backend server
// Note: In production, this URL will change to your Render URL
const socket = io('http://localhost:3001');

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Define event handlers
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onWelcome(data: string) {
      setMessage(data);
    }

    // Attach listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('welcome', onWelcome);

    // Cleanup listeners when the component unmounts (crucial for React StrictMode)
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('welcome', onWelcome);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8 text-blue-400">Guess the OST</h1>
      
      <div className="bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-700 w-full max-w-md text-center">
        <h2 className="text-xl font-semibold mb-4 text-slate-300">System Status</h2>
        
        <div className="flex items-center justify-center gap-3 mb-6">
          {/* Pulsing indicator light */}
          <div className="relative flex h-4 w-4">
            {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-4 w-4 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          </div>
          <span className="text-lg">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        
        {message && (
          <div className="p-4 bg-blue-900/30 text-blue-300 rounded-lg border border-blue-800/50 animate-pulse">
            Server says: "{message}"
          </div>
        )}
      </div>
    </div>
  );
}

export default App;