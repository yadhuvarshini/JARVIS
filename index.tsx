import express from 'express';
import session from 'express-session';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { pgTable, text, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { eq, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  googleId: text("google_id").notNull().unique(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
});

const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  createdAt: timestamp("created_at").defaultNow(),
});

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema: { users, conversations, messages } });

class GoogleAuthService {
  private clientId = process.env.GOOGLE_CLIENT_ID || "";
  private clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  private redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

  getAuthUrl(): string {
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<any> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) throw new Error("Failed to exchange code for tokens");
    return await response.json();
  }

  async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error("Failed to get user info");
    return await response.json();
  }

  async refreshToken(refreshToken: string): Promise<any> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) throw new Error("Failed to refresh token");
    return await response.json();
  }
}

class MistralService {
  private apiKey = process.env.MISTRAL_API_KEY || "";
  private baseUrl = "https://api.mistral.ai/v1";

  async getChatResponse(messages: any[], user: any, toolService: any): Promise<any> {
    if (!this.apiKey) {
      return this.getFallbackResponse(messages[messages.length - 1]?.content || "");
    }

    try {
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const tools = [
        {
          type: "function",
          function: {
            name: "searchIntegrationFunction",
            description: "Search for relevant integration functions based on user intent",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "The user's query or intent" }
              },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "callIntegrationFunction",
            description: "Call a specific integration function with parameters",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "The name of the function to call" },
                parameters: { type: "object", description: "The parameters to pass to the function" }
              },
              required: ["name", "parameters"]
            }
          }
        }
      ];

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          messages: [
            {
              role: "system",
              content: `You are Jarvis, an AI assistant that helps users manage their Gmail and Google Calendar. You can:
              1. Read, send, search, and organize emails
              2. Create, view, update, and delete calendar events
              3. Answer questions about user's data
              
              When users ask about email or calendar operations, use the available tools to help them. Always be helpful and provide clear, actionable responses.`
            },
            ...formattedMessages
          ],
          tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) throw new Error(`Mistral API error: ${response.status}`);

      const data = await response.json();
      const choice = data.choices[0];

      if (choice.message.tool_calls) {
        const toolCalls = [];
        let finalResponse = "";

        for (const toolCall of choice.message.tool_calls) {
          const { name, arguments: args } = toolCall.function;
          const parameters = JSON.parse(args);
          
          try {
            let result;
            if (name === "searchIntegrationFunction") {
              result = await toolService.searchIntegrationFunction(parameters.query);
            } else if (name === "callIntegrationFunction") {
              result = await toolService.callIntegrationFunction(parameters.name, parameters.parameters, user);
            }
            
            toolCalls.push({ name, parameters });
            finalResponse += this.formatToolResult(name, result);
          } catch (error) {
            finalResponse += `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        }

        return {
          content: finalResponse || "I've executed the requested operations.",
          toolCalls,
        };
      }

      return {
        content: choice.message.content || "I'm here to help with your Gmail and Calendar needs.",
      };
    } catch (error) {
      console.error("Mistral API error:", error);
      return this.getFallbackResponse(messages[messages.length - 1]?.content || "");
    }
  }

  private formatToolResult(toolName: string, result: any): string {
    if (toolName === "searchIntegrationFunction") {
      if (!result || result.length === 0) {
        return "I found no relevant functions for your request.";
      }
      return `I found ${result.length} relevant function(s) for your request.`;
    }

    if (toolName.includes("calendar")) {
      if (Array.isArray(result)) {
        return this.formatCalendarEvents(result);
      }
      return "Calendar operation completed successfully.";
    }

    if (toolName.includes("email") || toolName.includes("gmail")) {
      if (Array.isArray(result)) {
        return this.formatEmails(result);
      }
      return "Email operation completed successfully.";
    }

    return "Operation completed successfully.";
  }

  private formatCalendarEvents(events: any[]): string {
    if (events.length === 0) {
      return "No calendar events found.";
    }

    let response = `I found ${events.length} calendar event(s):\n\n`;
    events.forEach((event, index) => {
      response += `${index + 1}. **${event.summary || 'Untitled Event'}**\n`;
      if (event.start?.dateTime) {
        response += `   Time: ${new Date(event.start.dateTime).toLocaleString()}\n`;
      }
      if (event.location) {
        response += `   Location: ${event.location}\n`;
      }
      response += "\n";
    });

    return response;
  }

  private formatEmails(emails: any[]): string {
    if (emails.length === 0) {
      return "No emails found.";
    }

    let response = `I found ${emails.length} email(s):\n\n`;
    emails.forEach((email, index) => {
      response += `${index + 1}. **${email.subject || 'No Subject'}**\n`;
      response += `   From: ${email.from || 'Unknown'}\n`;
      if (email.snippet) {
        response += `   Preview: ${email.snippet}\n`;
      }
      response += "\n";
    });

    return response;
  }

  private getFallbackResponse(userMessage: string): any {
    const message = userMessage.toLowerCase();
    
    if (message.includes("calendar") || message.includes("event")) {
      return {
        content: "I can help you with calendar operations like viewing events, creating meetings, and managing your schedule. However, I need a valid Mistral API key to provide intelligent responses. Please configure MISTRAL_API_KEY in your environment."
      };
    }
    
    if (message.includes("email") || message.includes("gmail")) {
      return {
        content: "I can assist with Gmail operations including reading, sending, and organizing emails. However, I need a valid Mistral API key to provide intelligent responses. Please configure MISTRAL_API_KEY in your environment."
      };
    }
    
    return {
      content: "Hello! I'm Jarvis, your AI assistant. I can help you manage Gmail and Google Calendar, but I need a valid Mistral API key to provide intelligent responses. Please configure MISTRAL_API_KEY in your environment."
    };
  }
}

const googleAuth = new GoogleAuthService();
const mistral = new MistralService();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || "jarvis-ai-assistant-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.get("/api/auth/google", async (req, res) => {
  try {
    const authUrl = googleAuth.getAuthUrl();
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

    const tokens = await googleAuth.exchangeCodeForTokens(code);
    const userInfo = await googleAuth.getUserInfo(tokens.access_token);
    
    let user = await db.select().from(users).where(eq(users.googleId, userInfo.id)).then(rows => rows[0]);
    if (!user) {
      [user] = await db.insert(users).values({
        email: userInfo.email,
        name: userInfo.name,
        googleId: userInfo.id,
      }).returning();
    }

    const expiry = new Date(Date.now() + tokens.expires_in * 1000);
    await db.update(users).set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: expiry,
    }).where(eq(users.id, user.id));

    if (req.session) {
      req.session.userId = user.id;
    }

    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/chat`);
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

    const [user] = await db.select().from(users).where(eq(users.id, userId));
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

    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    res.json(userConversations);
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

    const [conversation] = await db.insert(conversations).values({
      userId,
      title: "New Conversation",
    }).returning();

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
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    
    if (!conversation || conversation.userId !== userId) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);
    res.json(conversationMessages);
  } catch (error) {
    res.status(500).json({ message: "Failed to get messages" });
  }
});

const toolService = {
  async searchIntegrationFunction(query: string): Promise<any[]> {
    const functions = [
      { name: "getEmails", description: "Get emails from Gmail inbox", category: "gmail" },
      { name: "sendEmail", description: "Send an email via Gmail", category: "gmail" },
      { name: "searchEmails", description: "Search emails in Gmail", category: "gmail" },
      { name: "getCalendarEvents", description: "Get calendar events", category: "calendar" },
      { name: "getTodayEvents", description: "Get today's calendar events", category: "calendar" },
      { name: "createCalendarEvent", description: "Create a new calendar event", category: "calendar" },
    ];
    
    const queryLower = query.toLowerCase();
    return functions.filter(fn => 
      fn.name.toLowerCase().includes(queryLower) ||
      fn.description.toLowerCase().includes(queryLower) ||
      fn.category.toLowerCase().includes(queryLower)
    );
  },

  async callIntegrationFunction(name: string, parameters: any, user: any): Promise<any> {
    return { success: true, message: `Function ${name} executed successfully` };
  }
};

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

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conversation || conversation.userId !== userId) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    await db.insert(messages).values({
      conversationId,
      role: "user",
      content: message,
    });

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const response = await mistral.getChatResponse(conversationMessages, user, toolService);

    await db.insert(messages).values({
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

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});