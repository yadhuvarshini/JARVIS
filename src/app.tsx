"use client";

import { useState, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: false,
    },
  },
});

async function apiRequest(method: string, url: string, body?: any) {
  const config: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  };
  
  if (body) {
    config.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, config);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response;
}

interface User {
  id: string;
  email: string;
  name: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  toolCalls?: any[];
}

function useAuth() {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/auth/me");
        return response.json();
      } catch {
        return null;
      }
    },
  });

  const signInMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/google");
      const data = await response.json();
      window.location.href = data.authUrl;
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      window.location.href = "/";
    },
  });

  return {
    user,
    isLoading,
    signIn: signInMutation.mutate,
    signOut: signOutMutation.mutate,
  };
}

function useChat() {
  const { user } = useAuth();
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/conversations"],
    enabled: !!user,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/conversations");
      return response.json();
    },
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", currentConversationId, "messages"],
    enabled: !!currentConversationId,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/conversations/${currentConversationId}/messages`);
      return response.json();
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/conversations"),
    onSuccess: async (response) => {
      const conversation = await response.json();
      setCurrentConversationId(conversation.id);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!currentConversationId) {
        throw new Error("No active conversation");
      }
      
      const response = await apiRequest("POST", "/api/chat", {
        message,
        conversationId: currentConversationId,
      });
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", currentConversationId, "messages"],
      });
    },
  });

  useEffect(() => {
    if (user && conversations.length === 0 && !createConversationMutation.isPending) {
      createConversationMutation.mutate();
    } else if (conversations.length > 0 && !currentConversationId) {
      setCurrentConversationId(conversations[0].id);
    }
  }, [user, conversations, currentConversationId]);

  return {
    messages,
    conversations,
    currentConversationId,
    isLoading: sendMessageMutation.isPending,
    sendMessage: sendMessageMutation.mutate,
  };
}

function Button({ children, onClick, disabled, variant = "default", size = "default", className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const baseClasses = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-300 bg-white hover:bg-gray-50",
    ghost: "hover:bg-gray-100",
  };
  
  const sizes = {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-8 px-3 text-sm",
    lg: "h-12 px-8 text-lg",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, onKeyPress, placeholder, disabled, className = "" }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyPress?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      onKeyPress={onKeyPress}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    />
  );
}

function MessageBubble({ role, content, toolCalls }: { role: string; content: string; toolCalls?: any[] }) {
  const isUser = role === "user";

  return (
    <div className={`flex space-x-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
          🤖
        </div>
      )}
      
      <div className={`space-y-2 max-w-2xl ${isUser ? "order-first" : ""}`}>
        {toolCalls && toolCalls.length > 0 && (
          <div className="bg-gray-100 rounded-lg p-3 text-sm">
            <div className="text-gray-600 mb-2">⚙️ Executing functions...</div>
            {toolCalls.map((tool, i) => (
              <div key={i} className="text-xs text-gray-500 bg-white p-2 rounded mb-1">
                {tool.name}: {JSON.stringify(tool.parameters)}
              </div>
            ))}
          </div>
        )}
        
        <div className={`rounded-lg p-4 ${isUser ? "bg-blue-600 text-white" : "bg-white shadow-sm"}`}>
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
          👤
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start space-x-3">
      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
        🤖
      </div>
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const { signIn, isLoading } = useAuth();
  
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback";
  const setupInstructions = process.env.NEXT_PUBLIC_GOOGLE_SETUP_URL || "https://console.cloud.google.com/apis/credentials";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              🤖
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Jarvis</h1>
          </div>
          <Button onClick={() => signIn()} disabled={isLoading}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
              🤖
            </div>
            <h2 className="text-4xl font-semibold text-gray-900 mb-4">Your AI Assistant</h2>
            <p className="text-xl text-gray-600 mb-8">
              Jarvis helps you manage Gmail and Google Calendar with natural language conversations.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="text-4xl mb-4">📧</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Gmail Management</h3>
              <p className="text-gray-600 mb-4">
                Read, send, search, and organize your emails through natural conversation.
              </p>
              <div className="text-sm text-gray-500 space-y-1">
                <div>"Send an email to john@example.com about the meeting"</div>
                <div>"Show me unread emails from today"</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Calendar Operations</h3>
              <p className="text-gray-600 mb-4">
                Create, view, update, and delete calendar events seamlessly.
              </p>
              <div className="text-sm text-gray-500 space-y-1">
                <div>"Schedule a meeting tomorrow at 2 PM"</div>
                <div>"What's on my calendar today?"</div>
              </div>
            </div>
          </div>

          <Button size="lg" onClick={() => signIn()} disabled={isLoading} className="mb-8">
            Get Started with Google
          </Button>

          <div className="bg-blue-50 rounded-lg p-6 text-left">
            <h3 className="font-semibold text-gray-900 mb-4">Setup Instructions:</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p>1. Go to <a href={setupInstructions} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a></p>
              <p>2. Create a new project or select existing one</p>
              <p>3. Enable Gmail API and Calendar API</p>
              <p>4. Create OAuth 2.0 credentials</p>
              <p>5. Add this redirect URI: <code className="bg-white px-2 py-1 rounded">{redirectUri}</code></p>
              <p>6. Add your domain to authorized domains</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <div className="flex items-center justify-center space-x-4">
            <span>Powered by Mistral AI</span>
            <div className="flex items-center space-x-1">
              <span>🔒</span>
              <span>Secure Google OAuth Integration</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Chat() {
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
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm">
              🤖
            </div>
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
                📧 Gmail
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                📅 Calendar
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                👤
              </div>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                ↗️
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
              role={message.role}
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
                disabled={isLoading}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 transform -translate-y-1/2"
              >
                ➤
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

function Router() {
  const { user, isLoading } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (user && pathname === "/") {
      window.history.pushState(null, "", "/chat");
      setPathname("/chat");
    }
    if (!user && !isLoading && pathname === "/chat") {
      window.history.pushState(null, "", "/");
      setPathname("/");
    }
  }, [user, pathname, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (pathname === "/chat" && user) {
    return <Chat />;
  }

  return <Landing />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}