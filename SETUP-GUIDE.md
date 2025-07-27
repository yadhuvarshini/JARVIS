# Complete Setup Guide for Jarvis AI Assistant

## Local Development Setup

### Step 1: Prerequisites

Make sure you have Node.js installed (version 18 or higher):

```bash
node --version
npm --version
```

If you don't have Node.js, download it from [nodejs.org](https://nodejs.org/)

### Step 2: Download the Project

```bash
git clone <your-repo-url>
cd jarvis-ai-assistant
```

### Step 3: Install Dependencies

```bash
npm install
```

This will install the minimal required dependencies:
- express (web server)
- express-session (session management)
- pg (PostgreSQL client)
- @vercel/postgres (Vercel database client)

### Step 4: Environment Configuration

Create your environment file:

```bash
cp .env.example .env
```

Now edit the `.env` file and fill in your API keys:

```env
# Google OAuth (Required)
GOOGLE_CLIENT_ID=your_google_client_id_from_cloud_console
GOOGLE_CLIENT_SECRET=your_google_client_secret_from_cloud_console
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Mistral AI (Required)
MISTRAL_API_KEY=your_mistral_api_key

# Session Security (Required)
SESSION_SECRET=your_random_64_character_string

# Database (Optional for local development)
DATABASE_URL=postgresql://username:password@host:port/database

# Application Settings
PORT=3000
GOOGLE_SETUP_URL=https://console.cloud.google.com/apis/credentials
CLIENT_URL=http://localhost:3000
```

### Step 5: Get Your API Keys

#### Google OAuth Setup (Required - Free)

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Click "Select a project" → "New Project"
   - Name: "Jarvis AI Assistant"
   - Click "Create"

2. **Enable APIs**
   - Go to "APIs & Services" → "Library"
   - Search and enable these APIs:
     - Gmail API
     - Google Calendar API

3. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Name: "Jarvis AI Assistant"
   - Authorized redirect URIs:
     - Add: `http://localhost:3000/api/auth/callback`
     - Add: `https://your-domain.com/api/auth/callback` (for production)

4. **Copy Credentials**
   - Copy "Client ID" → paste into `GOOGLE_CLIENT_ID`
   - Copy "Client Secret" → paste into `GOOGLE_CLIENT_SECRET`

#### Mistral AI API Key (Required - Paid/Free Tier)

1. **Sign Up**
   - Go to [Mistral AI Console](https://console.mistral.ai/)
   - Create account or sign in

2. **Generate API Key**
   - Navigate to "API Keys" section
   - Click "Create new secret key"
   - Copy the key → paste into `MISTRAL_API_KEY`

#### Session Secret (Required - Generate Yourself)

Generate a random session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output → paste into `SESSION_SECRET`

### Step 6: Run the Application

Start the server:

```bash
npm start
```

You should see:
```
Server running on port 3000
```

Open your browser and go to: `http://localhost:3000`

### Step 7: Test the Application

1. **Landing Page Test**
   - You should see the Jarvis landing page
   - Check that the redirect URI shows your local URL
   - Click "Sign in with Google" button

2. **OAuth Test**
   - Should redirect to Google login
   - After signing in, should redirect back to `/chat`
   - You should see the chat interface

3. **Chat Test**
   - Type a message like "Hello Jarvis"
   - Should get a response from Mistral AI

## Production Deployment

### Deploy to Vercel

1. **Prepare for Deployment**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com/)
   - Click "Import Project"
   - Select your GitHub repository
   - Add environment variables in Vercel dashboard
   - Deploy

3. **Update Environment Variables**
   - In Vercel dashboard, go to "Settings" → "Environment Variables"
   - Add all variables from your `.env` file
   - Update `GOOGLE_REDIRECT_URI` to `https://your-app.vercel.app/api/auth/callback`

4. **Update Google OAuth**
   - Go back to Google Cloud Console
   - Add your Vercel URL to authorized redirect URIs

## Troubleshooting

### Common Errors and Solutions

1. **"Cannot find module" errors**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **"Failed to initiate sign in"**
   - Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
   - Verify redirect URI matches exactly in Google Cloud Console

3. **"Not authenticated" errors**
   - Clear browser cookies
   - Check `SESSION_SECRET` is set
   - Restart the server

4. **AI not responding**
   - Verify `MISTRAL_API_KEY` is correct
   - Check if you have API credits in Mistral console

5. **Port already in use**
   ```bash
   lsof -ti:3000 | xargs kill -9
   npm start
   ```

### Development Tips

- Use browser developer tools (F12) to check for JavaScript errors
- Check server logs for backend issues
- Test OAuth flow in incognito mode to avoid cookie issues
- Use `NODE_ENV=development` for more detailed logs

### File Structure

```
jarvis-ai-assistant/
├── app.js              # Main application (backend + frontend)
├── package.json        # Dependencies
├── vercel.json         # Vercel config
├── .env               # Environment variables (don't commit!)
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules
├── README.md          # Main documentation
├── SETUP-GUIDE.md     # This file
└── screenshots/       # README images
```

### Next Steps

Once you have the application running:

1. **Customize the UI** - Edit the HTML in `app.js`
2. **Add Features** - Extend the Mistral AI integration
3. **Database Setup** - Add PostgreSQL for persistent storage
4. **Security** - Add rate limiting and input validation
5. **Monitoring** - Add logging and error tracking

### Support

If you encounter issues:

1. Check this guide first
2. Review the main README.md
3. Check browser and server logs
4. Verify all environment variables are set correctly

## Security Checklist

Before deploying to production:

- [ ] Use strong `SESSION_SECRET` (32+ characters)
- [ ] Enable HTTPS in production
- [ ] Keep API keys secure
- [ ] Add CORS headers if needed
- [ ] Implement rate limiting
- [ ] Add input validation
- [ ] Set up monitoring