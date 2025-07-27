import { Bot, User } from "lucide-react";
import { ToolCallIndicator } from "./tool-call-indicator";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: any[];
}

export function MessageBubble({ role, content, toolCalls }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex items-start space-x-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="h-4 w-4 text-blue-600" />
        </div>
      )}
      
      <div className={`space-y-3 max-w-2xl ${isUser ? "order-first" : ""}`}>
        {toolCalls && toolCalls.length > 0 && (
          <div className="space-y-2">
            {toolCalls.map((toolCall, index) => (
              <ToolCallIndicator
                key={index}
                name={toolCall.name}
                parameters={toolCall.parameters}
              />
            ))}
          </div>
        )}
        
        <div
          className={`rounded-lg p-4 ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-900 shadow-sm"
          }`}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-gray-600" />
        </div>
      )}
    </div>
  );
}
