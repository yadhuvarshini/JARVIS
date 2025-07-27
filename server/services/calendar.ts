import { User } from "@shared/schema";
import { googleAuthService } from "./google-auth";

class CalendarService {
  async getEvents(user: User, timeMin?: string, timeMax?: string): Promise<any[]> {
    const accessToken = await this.getValidAccessToken(user);
    
    const params = new URLSearchParams({
      orderBy: "startTime",
      singleEvents: "true",
    });

    if (timeMin) params.append("timeMin", timeMin);
    if (timeMax) params.append("timeMax", timeMax);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch calendar events");
    }

    const data = await response.json();
    return data.items || [];
  }

  async createEvent(user: User, summary: string, start: string, end: string, description?: string, location?: string): Promise<any> {
    const accessToken = await this.getValidAccessToken(user);
    
    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: start,
        timeZone: "UTC",
      },
      end: {
        dateTime: end,
        timeZone: "UTC",
      },
    };

    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error("Failed to create calendar event");
    }

    return await response.json();
  }

  async updateEvent(user: User, eventId: string, updates: any): Promise<any> {
    const accessToken = await this.getValidAccessToken(user);
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to update calendar event");
    }

    return await response.json();
  }

  async deleteEvent(user: User, eventId: string): Promise<void> {
    const accessToken = await this.getValidAccessToken(user);
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to delete calendar event");
    }
  }

  async getTodayEvents(user: User): Promise<any[]> {
    const today = new Date();
    const timeMin = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const timeMax = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    
    return this.getEvents(user, timeMin, timeMax);
  }

  private async getValidAccessToken(user: User): Promise<string> {
    if (!user.accessToken) {
      throw new Error("No access token available");
    }

    if (user.tokenExpiry && new Date() > user.tokenExpiry) {
      if (!user.refreshToken) {
        throw new Error("Access token expired and no refresh token available");
      }
      
      const tokens = await googleAuthService.refreshToken(user.refreshToken);
      return tokens.access_token;
    }

    return user.accessToken;
  }
}

export const calendarService = new CalendarService();
