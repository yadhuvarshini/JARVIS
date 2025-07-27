import { User } from "@shared/schema";
import { googleAuthService } from "./google-auth";

class GmailService {
  async getEmails(user: User, query?: string, maxResults = 10): Promise<any[]> {
    const accessToken = await this.getValidAccessToken(user);
    
    let searchQuery = query || "in:inbox";
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch emails");
    }

    const data = await response.json();
    if (!data.messages) {
      return [];
    }

    const emails = [];
    for (const message of data.messages.slice(0, maxResults)) {
      const emailData = await this.getEmailDetails(accessToken, message.id);
      emails.push(emailData);
    }

    return emails;
  }

  async sendEmail(user: User, to: string, subject: string, body: string): Promise<any> {
    const accessToken = await this.getValidAccessToken(user);
    
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "",
      body,
    ].join("\n");

    const encodedEmail = Buffer.from(email).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedEmail,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to send email");
    }

    return await response.json();
  }

  async searchEmails(user: User, query: string): Promise<any[]> {
    return this.getEmails(user, query);
  }

  private async getEmailDetails(accessToken: string, messageId: string): Promise<any> {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch email details");
    }

    const data = await response.json();
    const headers = data.payload?.headers || [];
    
    return {
      id: data.id,
      subject: headers.find((h: any) => h.name === "Subject")?.value || "No Subject",
      from: headers.find((h: any) => h.name === "From")?.value || "Unknown",
      to: headers.find((h: any) => h.name === "To")?.value || "",
      snippet: data.snippet || "",
      body: this.extractBody(data.payload),
    };
  }

  private extractBody(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString();
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString();
        }
      }
    }
    
    return "";
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

export const gmailService = new GmailService();
