# Jarvis AI Assistant

A simple AI-powered assistant that integrates with Gmail and Google Calendar using natural language conversations.

## Features

- Gmail management (read, send, search emails)
- Google Calendar operations (create, view, update events)
- Natural language interface powered by Mistral AI
- Secure Google OAuth authentication

## Setup

### Environment Variables

Set these environment variables:

```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/callback
MISTRAL_API_KEY=your_mistral_api_key
SESSION_SECRET=your_session_secret
GOOGLE_SETUP_URL=https://console.cloud.google.com/apis/credentials
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Enable Gmail API and Calendar API
4. Create OAuth 2.0 credentials
5. Add your redirect URI: `https://your-domain.com/api/auth/callback`
6. Add your domain to authorized domains

### Deployment

#### Vercel

1. Clone this repository
2. Deploy to Vercel
3. Add environment variables in Vercel dashboard
4. Update `GOOGLE_REDIRECT_URI` to your Vercel domain

#### Local Development

```bash
npm install
npm start
```

## Usage

1. Visit the landing page
2. Sign in with Google
3. Start chatting with Jarvis
4. Ask questions like:
   - "Show me today's calendar"
   - "Send an email to john@example.com"
   - "What emails did I receive today?"

## License

MIT