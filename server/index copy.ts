import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import { Pool } from 'pg';
import { createClient } from '@vercel/postgres';
import fetch from 'node-fetch';

// Type definitions
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name: string;
      accessToken: string;
      refreshToken?: string;
    };
    messages?: Array<{role: string, content: string, name?: string, tool_calls?: any}>;
  }
}

interface CalendarEvent {
  id?: string;
  summary: string;
  start: { dateTime: string, date?: string };
  end: { dateTime: string, date?: string };
  location?: string;
  description?: string;
  attendees?: Array<{email: string}>;
}

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

// Initialize app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'jarvis-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 86400000 },
}));

// Database configuration
const db = process.env.POSTGRES_URL ? createClient({
  connectionString: process.env.POSTGRES_URL,
}) : new Pool({
  connectionString: process.env.DATABASE_URL,
});

class MistralService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || '';
    this.baseUrl = 'https://api.mistral.ai/v1';
    
    if (!this.apiKey) {
      console.warn('MISTRAL_API_KEY is not configured - some features may not work');
    }
  }

  async getChatResponse(
    messages: Array<{role: string, content: string, name?: string, tool_calls?: any}>,
    user: any = null
  ): Promise<{
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: any;
    }>;
  }> {
    if (!this.apiKey) {
      return { 
        content: 'MISTRAL_API_KEY not configured. Please set up your API key to enable full functionality.' 
      };
    }

    try {
      // Prepare the messages array properly
      const preparedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name && { name: msg.name }),
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      }));

      // Always include the system message first
      preparedMessages.unshift({
        role: 'system',
        content: this.getSystemPrompt(user)
      });

      const requestBody: any = {
        model: 'ministral-8b-latest',
        messages: preparedMessages,
        temperature: 0.7,
        max_tokens: 1000
      };

      // Only enable tools if user is authenticated
      if (user?.accessToken) {
        requestBody.tools = this.getToolDefinitions();
        requestBody.tool_choice = 'auto';
      }

      console.log('Sending to Mistral API:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Mistral API error details:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Mistral API response:', JSON.stringify(data, null, 2));
      
      if (!data.choices || !data.choices[0]?.message) {
        throw new Error('Invalid response structure from Mistral API');
      }

      const assistantMessage = data.choices[0].message;

      return {
        content: assistantMessage.content || '',
        toolCalls: assistantMessage.tool_calls?.map((call: any) => ({
          id: call.id,
          name: call.function?.name,
          arguments: this.safeParseJson(call.function?.arguments)
        })).filter((call: any) => call.name)
      };
    } catch (error) {
      console.error('Detailed Mistral API error:', error);
      return { 
        content: 'Sorry, I encountered an error processing your request. Please try again later.' 
      };
    }
  }

  private safeParseJson(jsonString: string): any {
    try {
      return jsonString ? JSON.parse(jsonString) : {};
    } catch (e) {
      console.error('Failed to parse JSON:', jsonString);
      return {};
    }
  }

  private getSystemPrompt(user: any): string {
    let prompt = `You are Jarvis, an AI assistant specialized in Gmail and Google Calendar management. Follow these rules:
1. NEVER use placeholder data (like example@email.com or "Meeting with X")
2. For actions requiring specific details (emails/events), ALWAYS ask for:
   - Recipient's REAL email address for emails
   - Specific date/time for calendar events
   - Complete details before taking action
3. Be concise but thorough in responses
4. Confirm actions with user before executing`;

    if (user?.email) {
      prompt += `\n\nCurrent authenticated user: ${user.email}`;
    }

    return prompt;
  }

  private getToolDefinitions(): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_emails',
          description: 'Fetch emails from Gmail inbox',
          parameters: {
            type: 'object',
            properties: {
              max_results: {
                type: 'number',
                description: 'Maximum number of emails to return (default: 5)',
                default: 5
              },
              query: {
                type: 'string',
                description: 'Gmail search query to filter emails'
              },
              label: {
                type: 'string',
                description: 'Filter by label ID'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_email',
          description: 'Send an email through Gmail',
          parameters: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient email address (REQUIRED)'
              },
              subject: {
                type: 'string',
                description: 'Email subject (REQUIRED)'
              },
              body: {
                type: 'string',
                description: 'Email content in HTML format (REQUIRED)'
              },
              cc: {
                type: 'array',
                items: { type: 'string' },
                description: 'CC recipients'
              },
              bcc: {
                type: 'array',
                items: { type: 'string' },
                description: 'BCC recipients'
              }
            },
            required: ['to', 'subject', 'body']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_calendar_events',
          description: 'Fetch calendar events within a time range',
          parameters: {
            type: 'object',
            properties: {
              time_min: {
                type: 'string',
                description: 'Start time in ISO 8601 format (default: current time)',
                default: new Date().toISOString()
              },
              time_max: {
                type: 'string',
                description: 'End time in ISO 8601 format (default: end of current day)',
                default: new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
              },
              query: {
                type: 'string',
                description: 'Search query to filter events'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_calendar_event',
          description: 'Create a new calendar event',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'Event title (REQUIRED)'
              },
              start: {
                type: 'string',
                description: 'Start time in ISO 8601 format (REQUIRED)'
              },
              end: {
                type: 'string',
                description: 'End time in ISO 8601 format (REQUIRED)'
              },
              location: {
                type: 'string',
                description: 'Physical or virtual meeting location'
              },
              description: {
                type: 'string',
                description: 'Event description/details'
              },
              attendees: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of attendee email addresses'
              }
            },
            required: ['summary', 'start', 'end']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_calendar_event',
          description: 'Update an existing calendar event',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to update (REQUIRED)'
              },
              summary: {
                type: 'string',
                description: 'Updated event title'
              },
              start: {
                type: 'string',
                description: 'Updated start time in ISO 8601 format'
              },
              end: {
                type: 'string',
                description: 'Updated end time in ISO 8601 format'
              },
              location: {
                type: 'string',
                description: 'Updated location'
              },
              description: {
                type: 'string',
                description: 'Updated description'
              },
              attendees: {
                type: 'array',
                items: { type: 'string' },
                description: 'Updated list of attendee email addresses'
              }
            },
            required: ['event_id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_calendar_event',
          description: 'Delete a calendar event',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to delete (REQUIRED)'
              }
            },
            required: ['event_id']
          }
        }
      }
    ];
  }
}

const mistralService = new MistralService();

class GoogleAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }
  }

  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<any> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });
    return response.json();
  }

  async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.json();
  }

  async refreshAccessToken(refreshToken: string): Promise<any> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    return response.json();
  }
}

class GoogleCalendarService {
  async getEvents(accessToken: string, timeMin?: string, timeMax?: string, query?: string): Promise<CalendarEvent[]> {
    const now = new Date();
    const defaultTimeMin = timeMin || now.toISOString();
    const defaultTimeMax = timeMax || new Date(now.setHours(23, 59, 59, 999)).toISOString();

    let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(defaultTimeMin)}&` +
      `timeMax=${encodeURIComponent(defaultTimeMax)}&` +
      `singleEvents=true&orderBy=startTime`;

    if (query) {
      url += `&q=${encodeURIComponent(query)}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();
    return data.items || [];
  }

  async createEvent(accessToken: string, event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );
    return response.json();
  }

  async updateEvent(accessToken: string, eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );
    return response.json();
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  }
}

class GmailService {
  async sendEmail(accessToken: string, email: EmailMessage): Promise<any> {
    const emailContent = [
      `To: ${email.to}`,
      ...(email.cc ? [`Cc: ${email.cc.join(', ')}`] : []),
      ...(email.bcc ? [`Bcc: ${email.bcc.join(', ')}`] : []),
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${email.subject}`,
      '',
      email.body,
    ].join('\n');

    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedEmail,
        }),
      }
    );
    return response.json();
  }

  async getEmails(accessToken: string, maxResults = 5, query?: string, label?: string): Promise<any[]> {
    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
    
    if (query) {
      url += `&q=${encodeURIComponent(query)}`;
    }
    if (label) {
      url += `&labelIds=${encodeURIComponent(label)}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();
    return data.messages || [];
  }

  async getEmail(accessToken: string, messageId: string): Promise<any> {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.json();
  }

  async deleteEmail(accessToken: string, messageId: string): Promise<void> {
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  }
}

// Initialize services
const googleAuth = new GoogleAuth();
const calendarService = new GoogleCalendarService();
const gmailService = new GmailService();

async function handleToolCalls(toolCalls: any[], user: any) {
  const results = [];
  
  for (const toolCall of toolCalls) {
    try {
      let result;
      const { name, arguments: args } = toolCall;
      
      switch (name) {
        case 'get_emails':
          const emails = await gmailService.getEmails(
            user.accessToken, 
            args.max_results || 5,
            args.query,
            args.label
          );
          
          // Get details for each email
          result = await Promise.all(
            emails.map(async (email: any) => {
              const detail = await gmailService.getEmail(user.accessToken, email.id);
              return {
                id: email.id,
                subject: detail.payload.headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
                from: detail.payload.headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender',
                date: detail.payload.headers.find((h: any) => h.name === 'Date')?.value,
                snippet: detail.snippet
              };
            })
          );
          break;
          
        case 'send_email':
          result = await gmailService.sendEmail(user.accessToken, {
            to: args.to,
            subject: args.subject,
            body: args.body,
            cc: args.cc,
            bcc: args.bcc
          });
          break;
          
        case 'get_calendar_events':
          result = await calendarService.getEvents(
            user.accessToken, 
            args.time_min,
            args.time_max,
            args.query
          );
          break;
          
        case 'create_calendar_event':
          result = await calendarService.createEvent(user.accessToken, {
            summary: args.summary,
            start: { dateTime: args.start },
            end: { dateTime: args.end },
            location: args.location,
            description: args.description,
            attendees: args.attendees?.map((email: string) => ({ email }))
          });
          break;
          
        case 'update_calendar_event':
          const updateData: Partial<CalendarEvent> = {};
          if (args.summary) updateData.summary = args.summary;
          if (args.start) updateData.start = { dateTime: args.start };
          if (args.end) updateData.end = { dateTime: args.end };
          if (args.location) updateData.location = args.location;
          if (args.description) updateData.description = args.description;
          if (args.attendees) updateData.attendees = args.attendees.map((email: string) => ({ email }));
          
          result = await calendarService.updateEvent(
            user.accessToken,
            args.event_id,
            updateData
          );
          break;
          
        case 'delete_calendar_event':
          await calendarService.deleteEvent(user.accessToken, args.event_id);
          result = { success: true, message: 'Event deleted successfully' };
          break;
          
        default:
          result = { error: `Unknown tool call: ${name}` };
      }
      
      results.push({ 
        toolCallId: toolCall.id,
        name,
        result 
      });
    } catch (error) {
      console.error(`Tool ${toolCall.name} failed:`, error);
      results.push({ 
        toolCallId: toolCall.id,
        name: toolCall.name,
        error: error.message
      });
    }
  }
  
  return results;
}

// Token refresh middleware
app.use(async (req, res, next) => {
  if (req.session.user?.refreshToken && req.session.user?.accessToken) {
    try {
      // Verify if token is still valid
      await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        headers: { Authorization: `Bearer ${req.session.user.accessToken}` }
      });
      next();
    } catch (error) {
      try {
        const tokens = await googleAuth.refreshAccessToken(req.session.user.refreshToken);
        req.session.user.accessToken = tokens.access_token;
        if (tokens.refresh_token) {
          req.session.user.refreshToken = tokens.refresh_token;
        }
        next();
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        res.status(401).json({ error: 'Authentication required' });
      }
    }
  } else {
    next();
  }
});

// Auth Routes
app.get('/api/auth/google', async (req, res) => {
  const authUrl = googleAuth.getAuthUrl();
  res.json({ authUrl });
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (typeof code !== 'string') throw new Error('Invalid code');
    
    const tokens = await googleAuth.exchangeCodeForTokens(code);
    const userInfo = await googleAuth.getUserInfo(tokens.access_token);
    
    req.session.user = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };

    res.redirect('/chat');
  } catch (error) {
    console.error('Auth callback error:', error);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// Chat Endpoint with Tool Handling
app.post('/api/chat', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { message } = req.body;
  const messages = req.session.messages || [];
  messages.push({ role: 'user', content: message });

  try {
    // Get initial response from Mistral
    const { content, toolCalls } = await mistralService.getChatResponse(messages, req.session.user);
    
    if (toolCalls?.length) {
      const toolResults = await handleToolCalls(toolCalls, req.session.user);
      
      // Create tool response messages
      const toolResponseMessages = toolResults.map(result => ({
        role: 'tool' as const,
        content: JSON.stringify(result.result || result.error),
        tool_call_id: result.toolCallId
      }));

      // Create new messages array for final request
      const finalMessages = [
        ...messages,
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: toolCalls.map(call => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments)
            }
          }))
        },
        ...toolResponseMessages
      ];
      
      // Get final response
      const finalResponse = await mistralService.getChatResponse(finalMessages, req.session.user);
      messages.push({ role: 'assistant', content: finalResponse.content });
    } else {
      messages.push({ role: 'assistant', content });
    }

    req.session.messages = messages.slice(-10);
    res.json(messages[messages.length - 1]);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Serve HTML
app.get('/', (req, res) => {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
  const setupUrl = process.env.GOOGLE_SETUP_URL || 'https://console.cloud.google.com/apis/credentials';
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Jarvis AI Assistant</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    header { border-bottom: 1px solid #e5e5e5; padding: 20px 0; }
    .header-content { display: flex; justify-content: space-between; align-items: center; }
    .logo { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 600; }
    .icon { width: 32px; height: 32px; background: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; }
    .btn { padding: 10px 20px; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
    .btn:hover { background: #f9fafb; }
    .btn-primary { background: #3b82f6; color: white; border-color: #3b82f6; }
    .btn-primary:hover { background: #2563eb; }
    main { padding: 60px 0; text-align: center; }
    .hero { margin-bottom: 60px; }
    .hero h1 { font-size: 48px; margin-bottom: 20px; }
    .hero p { font-size: 20px; color: #6b7280; margin-bottom: 40px; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; margin-bottom: 60px; }
    .feature { background: #f9fafb; padding: 30px; border-radius: 8px; text-align: left; }
    .feature-icon { font-size: 32px; margin-bottom: 15px; }
    .feature h3 { margin-bottom: 10px; }
    .feature p { color: #6b7280; margin-bottom: 15px; }
    .examples { font-size: 14px; color: #9ca3af; }
    .setup { background: #eff6ff; padding: 30px; border-radius: 8px; text-align: left; margin-bottom: 40px; }
    .setup h3 { margin-bottom: 20px; }
    .setup ol { margin-left: 20px; }
    .setup li { margin-bottom: 8px; }
    .setup code { background: white; padding: 4px 8px; border-radius: 4px; font-family: monospace; }
    .setup a { color: #3b82f6; }
    footer { border-top: 1px solid #e5e5e5; padding: 30px 0; text-align: center; color: #6b7280; }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="header-content">
        <div class="logo">
          <div class="icon">🤖</div>
          Jarvis
        </div>
        <button class="btn" onclick="signIn()">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  </header>

  <main>
    <div class="container">
      <div class="hero">
        <div class="icon" style="width: 64px; height: 64px; margin: 0 auto 30px; font-size: 32px;">🤖</div>
        <h1>Your AI Assistant</h1>
        <p>Jarvis helps you manage Gmail and Google Calendar with natural language conversations.</p>
      </div>

      <div class="features">
        <div class="feature">
          <div class="feature-icon">📧</div>
          <h3>Gmail Management</h3>
          <p>Read, send, search, and organize your emails through natural conversation.</p>
          <div class="examples">
            <div>"Send an email to john@example.com about the meeting"</div>
            <div>"Show me unread emails from today"</div>
          </div>
        </div>

        <div class="feature">
          <div class="feature-icon">📅</div>
          <h3>Calendar Operations</h3>
          <p>Create, view, update, and delete calendar events seamlessly.</p>
          <div class="examples">
            <div>"Schedule a meeting tomorrow at 2 PM"</div>
            <div>"What's on my calendar today?"</div>
          </div>
        </div>
      </div>

      <div class="setup">
        <h3>Setup Instructions:</h3>
        <ol>
          <li>Go to <a href="${setupUrl}" target="_blank">Google Cloud Console</a></li>
          <li>Create a new project or select existing one</li>
          <li>Enable Gmail API and Calendar API</li>
          <li>Create OAuth 2.0 credentials</li>
          <li>Add this redirect URI: <code>${redirectUri}</code></li>
          <li>Add your domain to authorized domains</li>
        </ol>
      </div>

      <button class="btn btn-primary" style="font-size: 18px; padding: 15px 30px;" onclick="signIn()">
        Get Started with Google
      </button>
    </div>
  </main>

  <footer>
    <div class="container">
      <div style="display: flex; justify-content: center; align-items: center; gap: 20px;">
        <span>Powered by Mistral AI</span>
        <span style="display: flex; align-items: center; gap: 5px;">
          🔒 Secure Google OAuth Integration
        </span>
      </div>
    </div>
  </footer>

  <script>
    async function signIn() {
      try {
        const response = await fetch('/api/auth/google');
        const data = await response.json();
        window.location.href = data.authUrl;
      } catch (error) {
        alert('Failed to initiate sign in');
      }
    }
  </script>
</body>
</html>
  `);
});

app.get('/chat', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Jarvis AI Assistant</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; height: 100vh; display: flex; flex-direction: column; background: #f9fafb; }
    .header { background: white; border-bottom: 1px solid #e5e5e5; padding: 15px 20px; }
    .header-content { display: flex; justify-content: space-between; align-items: center; }
    .logo { display: flex; align-items: center; gap: 10px; }
    .status { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7280; }
    .online { width: 8px; height: 8px; background: #10b981; border-radius: 50%; }
    .tags { display: flex; gap: 8px; }
    .tag { background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .user-info { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 32px; height: 32px; background: #d1d5db; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .btn { padding: 8px 12px; border: none; border-radius: 4px; background: transparent; cursor: pointer; }
    .btn:hover { background: #f3f4f6; }
    .chat-container { flex: 1; overflow-y: auto; padding: 20px; }
    .messages { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 15px; }
    .message { display: flex; gap: 10px; }
    .message.user { justify-content: flex-end; }
    .message-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .assistant-avatar { background: #dbeafe; color: #1d4ed8; }
    .user-avatar { background: #e5e7eb; color: #374151; }
    .message-content { max-width: 600px; padding: 12px 16px; border-radius: 12px; }
    .assistant-content { background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .user-content { background: #3b82f6; color: white; }
    .input-area { background: white; border-top: 1px solid #e5e5e5; padding: 20px; }
    .input-container { max-width: 800px; margin: 0 auto; display: flex; gap: 10px; align-items: end; }
    .input-wrapper { flex: 1; position: relative; }
    .message-input { width: 100%; padding: 12px 50px 12px 15px; border: 1px solid #d1d5db; border-radius: 25px; resize: none; font-family: inherit; font-size: 14px; }
    .message-input:focus { outline: none; border-color: #3b82f6; }
    .send-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border: none; background: #3b82f6; color: white; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .send-btn:hover { background: #2563eb; }
    .send-btn:disabled { background: #9ca3af; cursor: not-allowed; }
    .typing { display: flex; gap: 4px; padding: 15px; }
    .typing-dot { width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-10px); } }
    .footer-info { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; color: #6b7280; }
    .status-indicator { display: flex; align-items: center; gap: 5px; }
    .status-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <div class="logo">
        <div class="avatar">🤖</div>
        <div>
          <div style="font-weight: 600;">Jarvis</div>
          <div class="status">
            <div class="online"></div>
            Online
          </div>
        </div>
      </div>
      
      <div style="display: flex; align-items: center; gap: 15px;">
        <div class="tags">
          <span class="tag">📧 Gmail</span>
          <span class="tag">📅 Calendar</span>
        </div>
        
        <div class="user-info">
          <div class="avatar">👤</div>
          <button class="btn" onclick="signOut()">↗️</button>
        </div>
      </div>
    </div>
  </div>

  <div class="chat-container">
    <div class="messages" id="messages">
      <div class="message">
        <div class="message-avatar assistant-avatar">🤖</div>
        <div class="message-content assistant-content">
          <p>Hello! I'm Jarvis, your AI assistant. I can help you with:</p>
          <p>• Managing your Gmail (read, send, search emails)<br>
          • Google Calendar operations (create, view, update events)<br>
          • Natural language conversations about your data</p>
          <p>Try asking me something like "Show me today's calendar" or "Send an email to John"</p>
        </div>
      </div>
    </div>
  </div>

  <div class="input-area">
    <div class="input-container">
      <div class="input-wrapper">
        <textarea 
          id="messageInput" 
          class="message-input" 
          placeholder="Ask me anything about your Gmail or Calendar..."
          rows="1"
        ></textarea>
        <button id="sendBtn" class="send-btn" onclick="sendMessage()">➤</button>
      </div>
    </div>
    
    <div class="footer-info">
      <div style="display: flex; gap: 20px;">
        <span>Press Enter to send</span>
        <div class="status-indicator">
          <div class="status-dot"></div>
          Secure connection
        </div>
      </div>
      <div class="status-indicator">
        <div class="status-dot"></div>
        Connected
      </div>
    </div>
  </div>

  <script>
    let isLoading = false;

    function addMessage(role, content) {
      const messagesContainer = document.getElementById('messages');
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;
      
      const isUser = role === 'user';
      messageDiv.innerHTML = \`
        <div class="message-avatar \${isUser ? 'user-avatar' : 'assistant-avatar'}">
          \${isUser ? '👤' : '🤖'}
        </div>
        <div class="message-content \${isUser ? 'user-content' : 'assistant-content'}">
          <p style="white-space: pre-wrap;">\${content}</p>
        </div>
      \`;
      
      messagesContainer.appendChild(messageDiv);
      messageDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function showTyping() {
      const messagesContainer = document.getElementById('messages');
      const typingDiv = document.createElement('div');
      typingDiv.className = 'message';
      typingDiv.id = 'typing-indicator';
      typingDiv.innerHTML = \`
        <div class="message-avatar assistant-avatar">🤖</div>
        <div class="message-content assistant-content">
          <div class="typing">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      \`;
      messagesContainer.appendChild(typingDiv);
      typingDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function hideTyping() {
      const typingIndicator = document.getElementById('typing-indicator');
      if (typingIndicator) {
        typingIndicator.remove();
      }
    }

    async function sendMessage() {
      if (isLoading) return;
      
      const input = document.getElementById('messageInput');
      const message = input.value.trim();
      if (!message) return;
      
      input.value = '';
      isLoading = true;
      document.getElementById('sendBtn').disabled = true;
      
      addMessage('user', message);
      showTyping();
      
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        
        const data = await response.json();
        hideTyping();
        addMessage('assistant', data.content);
      } catch (error) {
        hideTyping();
        addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
      }
      
      isLoading = false;
      document.getElementById('sendBtn').disabled = false;
      input.focus();
    }

    async function signOut() {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    }

    document.getElementById('messageInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    document.getElementById('messageInput').addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  </script>
</body>
</html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
