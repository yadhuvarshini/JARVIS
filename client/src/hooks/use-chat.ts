import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./use-auth";

interface Message {
  id: string;
  role: string;
  content: string;
  toolCalls?: any[];
}

interface Conversation {
  id: string;
  title: string;
  userId: string;
}

export function useChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", currentConversationId, "messages"],
    enabled: !!currentConversationId,
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
  }, [user, conversations, currentConversationId, createConversationMutation]);

  return {
    messages,
    conversations,
    currentConversationId,
    isLoading: sendMessageMutation.isPending,
    sendMessage: sendMessageMutation.mutate,
    createConversation: createConversationMutation.mutate,
  };
}
