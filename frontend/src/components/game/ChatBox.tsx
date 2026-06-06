import { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UnifiedMessage } from "@/types";
import { useGameStore } from "@/store/gameStore";

interface ChatBoxProps {
  messages: UnifiedMessage[];
  onSendMessage: (text: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage }) => {
  const [inputValue, setInputValue] = useState("");
  const playerName = useGameStore((state) => state.playerName);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue("");
  };

  return (
    <div className="flex flex-col h-full w-full bg-background border border-border rounded-xl shadow-lg relative overflow-hidden">
      
      {/* Dynamic diagonal stripe header */}
      <div className="border-b border-border bg-card text-foreground py-3 px-4 flex justify-between items-center font-extrabold tracking-widest text-xs select-none">
        <span>LIVE GAME STREAM</span>
        <span className="animate-pulse bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-bold">LIVE</span>
      </div>

      <ScrollArea className="flex-1 p-4 bg-card-glass backdrop-blur-md">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            if (msg.type === "SYSTEM") {
              return (
                <div
                  key={msg.id}
                  className="text-center text-[10px] text-zinc-400 bg-input/60 border border-border/50 py-1 px-3 self-center font-bold uppercase tracking-wider rounded-md"
                >
                  SYSTEM: {msg.text}
                </div>
              );
            }

            const isSelf = msg.sender === playerName;
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 w-full max-w-[85%] ${
                  isSelf ? "items-start self-start" : "items-end self-end"
                }`}
              >
                {/* Sender Badge */}
                <span
                  className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded text-background ${
                    isSelf ? "bg-player-1 shadow-[0_0_8px_var(--player-1-glow)]" : "bg-player-2 shadow-[0_0_8px_var(--player-2-glow)]"
                  }`}
                >
                  {msg.sender}
                </span>
                
                {/* Dialogue Box */}
                <div
                  className={`relative border bg-card/85 text-foreground px-4 py-2.5 shadow-md text-xs font-semibold rounded-lg ${
                    isSelf
                      ? "border-border/80 border-l-4 border-l-player-1"
                      : "border-border/80 border-r-4 border-r-player-2"
                  }`}
                >
                  <p className="break-all whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })}
          
          <div ref={messagesEndRef} />

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <div className="text-xs font-semibold uppercase tracking-widest text-center">
                Waiting for dialogue...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-border bg-card flex gap-2"
      >
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your guess or chat..."
          className="flex-1 bg-input border border-border text-foreground px-3 py-2 rounded-lg font-semibold text-xs placeholder-zinc-600 focus:outline-none focus:border-player-1 focus:ring-1 focus:ring-player-1/30 transition-all"
          autoComplete="off"
        />
        <button 
          type="submit" 
          className="bg-player-1 text-background font-extrabold uppercase text-xs tracking-wider px-4 py-2 border border-player-1 rounded-lg hover:bg-player-1/90 shadow-[0_0_10px_var(--player-1-glow)] active:translate-y-px transition-all select-none cursor-pointer"
        >
          SEND
        </button>
      </form>
    </div>
  );
};

export default ChatBox;
