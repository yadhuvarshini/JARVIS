import { User } from "@shared/schema";
import { gmailService } from "./gmail";
import { calendarService } from "./calendar";

interface IntegrationFunction {
  name: string;
  description: string;
  parameters: any;
  category: string;
}

class ToolService {
  private functions: IntegrationFunction[] = [
    {
      name: "getEmails",
      description: "Get emails from Gmail inbox",
      parameters: { query: "string?", maxResults: "number?" },
      category: "gmail"
    },
    {
      name: "sendEmail",
      description: "Send an email via Gmail",
      parameters: { to: "string", subject: "string", body: "string" },
      category: "gmail"
    },
    {
      name: "searchEmails",
      description: "Search emails in Gmail",
      parameters: { query: "string" },
      category: "gmail"
    },
    {
      name: "getCalendarEvents",
      description: "Get calendar events",
      parameters: { timeMin: "string?", timeMax: "string?" },
      category: "calendar"
    },
    {
      name: "getTodayEvents",
      description: "Get today's calendar events",
      parameters: {},
      category: "calendar"
    },
    {
      name: "createCalendarEvent",
      description: "Create a new calendar event",
      parameters: { summary: "string", start: "string", end: "string", description: "string?", location: "string?" },
      category: "calendar"
    },
    {
      name: "updateCalendarEvent",
      description: "Update an existing calendar event",
      parameters: { eventId: "string", updates: "object" },
      category: "calendar"
    },
    {
      name: "deleteCalendarEvent",
      description: "Delete a calendar event",
      parameters: { eventId: "string" },
      category: "calendar"
    }
  ];

  async searchIntegrationFunction(query: string): Promise<IntegrationFunction[]> {
    const queryLower = query.toLowerCase();
    
    return this.functions.filter(fn => {
      return fn.name.toLowerCase().includes(queryLower) ||
             fn.description.toLowerCase().includes(queryLower) ||
             fn.category.toLowerCase().includes(queryLower);
    });
  }

  async callIntegrationFunction(name: string, parameters: any, user: User): Promise<any> {
    const fn = this.functions.find(f => f.name === name);
    if (!fn) {
      throw new Error(`Function ${name} not found`);
    }

    switch (name) {
      case "getEmails":
        return await gmailService.getEmails(user, parameters.query, parameters.maxResults);
      
      case "sendEmail":
        if (!parameters.to || !parameters.subject || !parameters.body) {
          throw new Error("Missing required parameters: to, subject, body");
        }
        return await gmailService.sendEmail(user, parameters.to, parameters.subject, parameters.body);
      
      case "searchEmails":
        if (!parameters.query) {
          throw new Error("Missing required parameter: query");
        }
        return await gmailService.searchEmails(user, parameters.query);
      
      case "getCalendarEvents":
        return await calendarService.getEvents(user, parameters.timeMin, parameters.timeMax);
      
      case "getTodayEvents":
        return await calendarService.getTodayEvents(user);
      
      case "createCalendarEvent":
        if (!parameters.summary || !parameters.start || !parameters.end) {
          throw new Error("Missing required parameters: summary, start, end");
        }
        return await calendarService.createEvent(
          user, 
          parameters.summary, 
          parameters.start, 
          parameters.end, 
          parameters.description, 
          parameters.location
        );
      
      case "updateCalendarEvent":
        if (!parameters.eventId || !parameters.updates) {
          throw new Error("Missing required parameters: eventId, updates");
        }
        return await calendarService.updateEvent(user, parameters.eventId, parameters.updates);
      
      case "deleteCalendarEvent":
        if (!parameters.eventId) {
          throw new Error("Missing required parameter: eventId");
        }
        await calendarService.deleteEvent(user, parameters.eventId);
        return { success: true };
      
      default:
        throw new Error(`Function ${name} not implemented`);
    }
  }
}

export const toolService = new ToolService();
