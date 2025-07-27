import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { googleAuthService } from "./services/google-auth";
import { mistralService } from "./services/mistral";
import { toolService } from "./services/tools";
import { insertMessageSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/auth/google", async (req, res) => {
    try {
      const authUrl = googleAuthService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code } = req.query;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Missing authorization code" });
      }

      const tokens = await googleAuthService.exchangeCodeForTokens(code);
      const userInfo = await googleAuthService.getUserInfo(tokens.access_token);
      
      let user = await storage.getUserByGoogleId(userInfo.id);
      if (!user) {
        user = await storage.createUser({
          email: userInfo.email,
          name: userInfo.name,
          googleId: userInfo.id,
        });
      }

      const expiry = new Date(Date.now() + tokens.expires_in * 1000);
      await storage.updateUserTokens(user.id, tokens.access_token, tokens.refresh_token, expiry);

      if (req.session) {
        req.session.userId = user.id;
      }

      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5000'}/chat`);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
      });
    }
    res.json({ message: "Logged out successfully" });
  });

  app.get("/api/conversations", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const conversations = await storage.getUserConversations(userId);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const conversation = await storage.createConversation({
        userId,
        title: "New Conversation",
      });

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const messages = await storage.getConversationMessages(id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { message, conversationId } = req.body;
      if (!message || !conversationId) {
        return res.status(400).json({ message: "Message and conversation ID required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      await storage.createMessage({
        conversationId,
        role: "user",
        content: message,
      });

      const messages = await storage.getConversationMessages(conversationId);
      const response = await mistralService.getChatResponse(messages, user, toolService);

      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls || null,
      });

      res.json(response);
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
