import { Message, User } from "@shared/schema";

interface ToolCall {
  name: string;
  parameters: any;
}

interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
}

interface ToolService {
  searchIntegrationFunction(query: string): Promise<any[]>;
  callIntegrationFunction(name: string, parameters: any, user: User): Promise<any>;
}

class MistralService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || "";
    if (!this.apiKey) {
      console.warn("MISTRAL_API_KEY not provided, using fallback responses");
    }
  }

  async getChatResponse(messages: Message[], user: User, toolService: ToolService): Promise<ChatResponse> {
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
                query: {
                  type: "string",
                  description: "The user's query or intent"
                }
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
                name: {
                  type: "string",
                  description: "The name of the function to call"
                },
                parameters: {
                  type: "object",
                  description: "The parameters to pass to the function"
                }
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

      if (!response.ok) {
        throw new Error(`Mistral API error: ${response.status}`);
      }

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

  private getFallbackResponse(userMessage: string): ChatResponse {
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

export const mistralService = new MistralService();
