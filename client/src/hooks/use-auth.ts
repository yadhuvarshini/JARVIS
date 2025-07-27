import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface User {
  id: string;
  email: string;
  name: string;
}

export function useAuth() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
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
      setLocation("/");
    },
  });

  useEffect(() => {
    if (user && location === "/") {
      setLocation("/chat");
    }
    if (!user && !isLoading && location === "/chat") {
      setLocation("/");
    }
  }, [user, location, isLoading, setLocation]);

  return {
    user,
    isLoading: isLoading || signInMutation.isPending,
    signIn: signInMutation.mutate,
    signOut: signOutMutation.mutate,
  };
}
