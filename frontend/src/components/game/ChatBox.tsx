import { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { UnifiedMessage } from "@/types";

interface ChatBoxProps {
  messages: UnifiedMessage[];
  onSendMessage: (text: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage }) => {
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue("");
  };

  return (
    <div className="flex flex-col h-100 w-full max-w-md border rounded-xl shadow-sm bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/50">
        <h3 className="text-sm font-semibold text-foreground">Room Chat</h3>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm ${
                msg.type === "SYSTEM"
                  ? "text-muted-foreground italic text-center text-xs my-1"
                  : "text-foreground wrap-break-word"
              }`}
            >
              {msg.type === "USER" && (
                <span className="font-bold text-primary mr-2">
                  {msg.sender}:
                </span>
              )}
              {msg.text}
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm italic mt-10">
              No messages yet. Say hello!
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t bg-background flex gap-2"
      >
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Guess the OST or chat..."
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" variant="default">
          Send
        </Button>
      </form>
    </div>
  );
};

export default ChatBox;
