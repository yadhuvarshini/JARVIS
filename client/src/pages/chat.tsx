import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { MessageBubble } from "@/components/ui/message-bubble";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import { Bot, Send, User, LogOut, Mail, Calendar } from "lucide-react";

export default function Chat() {
  const { user, signOut } = useAuth();
  const { messages, sendMessage, isLoading } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const message = input.trim();
    setInput("");
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="font-medium text-gray-900">Jarvis</h1>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Online</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex space-x-2">
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                <Mail className="h-3 w-3 mr-1" />
                Gmail
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                <Calendar className="h-3 w-3 mr-1" />
                Calendar
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-gray-600" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <MessageBubble
            role="assistant"
            content="Hello! I'm Jarvis, your AI assistant. I can help you with:

• Managing your Gmail (read, send, search emails)
• Google Calendar operations (create, view, update events)  
• Natural language conversations about your data

Try asking me something like 'Show me today's calendar' or 'Send an email to John'"
          />
          
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role as "user" | "assistant"}
              content={message.content}
              toolCalls={message.toolCalls}
            />
          ))}
          
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-3">
            <div className="flex-1 relative">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your Gmail or Calendar..."
                className="pr-12"
                disabled={isLoading}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 transform -translate-y-1/2"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>Press Enter to send</span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Secure connection</span>
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
