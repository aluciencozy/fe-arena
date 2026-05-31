import { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UnifiedMessage } from "@/types";

interface ChatBoxProps {
  messages: UnifiedMessage[];
  onSendMessage: (text: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage }) => {
  const [inputValue, setInputValue] = useState("");
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
    <div className="flex flex-col h-full w-full bg-background border-4 border-black dark:border-white shadow-[6px_6px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_rgba(255,255,255,1)] relative overflow-hidden bg-halftone">
      
      {/* Dynamic diagonal stripe header */}
      <div className="border-b-4 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black py-2.5 px-4 flex justify-between items-center font-bold tracking-widest text-xs select-none">
        <span>LIVE COMIC STREAM</span>
        <span className="animate-pulse bg-red-600 px-1 text-[10px] text-white">LIVE</span>
      </div>

      <ScrollArea className="flex-1 p-4 bg-white dark:bg-black bg-speedlines">
        <div className="flex flex-col gap-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.type === "SYSTEM"
                  ? "items-center my-1"
                  : "items-start"
              }`}
            >
              {msg.type === "SYSTEM" ? (
                <div className="text-center text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border-2 border-dashed border-black dark:border-white/50 py-1.5 px-3 font-semibold uppercase tracking-wider">
                  SYSTEM: {msg.text}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-1 w-full">
                  {/* Sender Badge */}
                  <span className="text-[10px] font-black uppercase tracking-wider bg-black dark:bg-white text-white dark:text-black px-2 py-0.5 border-2 border-black dark:border-white -skew-x-6 transform shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] dark:shadow-[1.5px_1.5px_0px_rgba(255,255,255,1)]">
                    {msg.sender}
                  </span>
                  
                  {/* Dialogue Bubble */}
                  <div className="relative border-2 border-black dark:border-white bg-white dark:bg-black text-black dark:text-white px-5 py-3 shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] max-w-[90%] font-black leading-snug rounded-[24px]">
                    <p className="break-all whitespace-pre-wrap text-sm">{msg.text}</p>
                    
                    {/* Speech bubble tail pointer decoration */}
                    <div className="absolute left-3 top-[-6px] w-2 h-2 bg-white dark:bg-black border-l-2 border-t-2 border-black dark:border-white rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          <div ref={messagesEndRef} />

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <div className="text-xs font-bold uppercase tracking-widest text-center">
                Waiting for dialogue...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="p-3 border-t-4 border-black dark:border-white bg-white dark:bg-black flex gap-2"
      >
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your guess or chat..."
          className="flex-1 bg-white dark:bg-black text-black dark:text-white px-3 py-2 border-2 border-black dark:border-white font-bold text-xs uppercase placeholder-zinc-500 focus:outline-none focus:bg-zinc-50 dark:focus:bg-zinc-950"
          autoComplete="off"
        />
        <button 
          type="submit" 
          className="bg-black dark:bg-white text-white dark:text-black font-extrabold uppercase text-xs tracking-wider px-4 py-2 border-2 border-black dark:border-white hover:bg-zinc-900 dark:hover:bg-zinc-100 shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_rgba(255,255,255,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_rgba(0,0,0,1)] dark:active:shadow-[1px_1px_0px_rgba(255,255,255,1)] transition-all"
        >
          SEND!
        </button>
      </form>
    </div>
  );
};

export default ChatBox;
