# Overview

This is an AI-powered assistant application built with a modern full-stack architecture. The application allows users to interact with an AI assistant that can perform actions with Google services (Gmail and Calendar) through OAuth integration and tool calling capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a monorepo structure with clear separation between client and server code:

- **Frontend**: React-based SPA using Vite for development and building
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for schema management
- **AI Integration**: Mistral AI for LLM capabilities with tool calling
- **External Integrations**: Google OAuth for Gmail and Calendar access

## Key Components

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite with custom configuration for development and production
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: TanStack React Query for server state and custom hooks for local state
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture
- **Server**: Express.js with TypeScript using ES modules
- **Database Layer**: Drizzle ORM with Neon PostgreSQL serverless database
- **Authentication**: Google OAuth 2.0 flow with session management
- **API Design**: RESTful endpoints with proper error handling and logging middleware

### Database Schema
The application uses three main entities:
- **Users**: Stores user information, Google ID, and OAuth tokens
- **Conversations**: Chat sessions belonging to users
- **Messages**: Individual messages within conversations with support for tool calls

### AI Integration
- **LLM Provider**: Mistral AI with streaming support
- **Tool System**: Custom tool registry for integration functions
- **Function Categories**: Gmail (read, send, search emails) and Calendar (get, create events)

## Data Flow

1. **User Authentication**: OAuth flow redirects to Google, exchanges code for tokens, creates/updates user record
2. **Chat Interaction**: User sends message → AI processes with tool calls → integrations execute → response streams back
3. **Tool Execution**: AI determines which tools to use → validates parameters → calls external APIs → returns structured results
4. **Conversation Management**: Messages and tool calls are persisted with conversation context

## External Dependencies

### Core Services
- **Neon Database**: Serverless PostgreSQL for data persistence
- **Google APIs**: Gmail and Calendar APIs for integration functionality
- **Mistral AI**: LLM service for chat and tool calling capabilities

### Key Libraries
- **Database**: `drizzle-orm`, `@neondatabase/serverless`
- **UI Components**: `@radix-ui/*` component primitives
- **Styling**: `tailwindcss`, `class-variance-authority`
- **State Management**: `@tanstack/react-query`
- **Build Tools**: `vite`, `esbuild`, `tsx`

## Deployment Strategy

The application is configured for development and production environments:

- **Development**: Uses Vite dev server with HMR and development middleware
- **Production Build**: 
  - Frontend builds to `dist/public` via Vite
  - Backend bundles to `dist/index.js` via esbuild
  - Single-process deployment serving both static files and API
- **Database Migrations**: Drizzle Kit handles schema changes with `db:push` command
- **Environment Variables**: Required for database, Google OAuth, and Mistral API credentials

The architecture supports deployment to platforms like Vercel, Railway, or any Node.js hosting service that supports PostgreSQL databases.