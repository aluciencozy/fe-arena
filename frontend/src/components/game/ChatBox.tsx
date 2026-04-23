import { useState } from "react";
import type { ChatMessage } from "@/types/";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatBoxProps = {
  chatMessages: ChatMessage[];
  sendChatMessage: (message: string) => void;
};

const ChatBox = ({ chatMessages, sendChatMessage }: ChatBoxProps) => {
  const [chatMessage, setChatMessage] = useState("");

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendChatMessage(chatMessage);
    setChatMessage("");
  };

  return (
    <div>
      <ScrollArea className="h-[300px] w-full p-4">
        {chatMessages.map((msg, i) => (
          <p key={i} className="text-sm text-zinc-400">
            {msg.message}{" "}
            <span className="text-zinc-600">- {msg.username}</span>
          </p>
        ))}
      </ScrollArea>
      <form onSubmit={handleSubmit} className="mt-2 flex flex-row gap-2">
        <Input
          type="text"
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          placeholder="Type your message..."
        />
      </form>
    </div>
  );
};

export default ChatBox;
