import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Mail, Calendar, Bot, Shield } from "lucide-react";

export default function Landing() {
  const { signIn, isLoading } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Jarvis</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => signIn()}
            disabled={isLoading}
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Sign in with Google</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <Bot className="h-16 w-16 text-blue-600 mx-auto mb-6" />
            <h2 className="text-4xl font-semibold text-gray-900 mb-4">Your AI Assistant</h2>
            <p className="text-xl text-gray-600 mb-8">
              Jarvis helps you manage Gmail and Google Calendar with natural language conversations.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <Card className="bg-gray-50">
              <CardContent className="p-6">
                <Mail className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Gmail Management</h3>
                <p className="text-gray-600 mb-4">
                  Read, send, search, and organize your emails through natural conversation.
                </p>
                <div className="text-sm text-gray-500 space-y-1">
                  <div>"Send an email to john@example.com about the meeting"</div>
                  <div>"Show me unread emails from today"</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardContent className="p-6">
                <Calendar className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Calendar Operations</h3>
                <p className="text-gray-600 mb-4">
                  Create, view, update, and delete calendar events seamlessly.
                </p>
                <div className="text-sm text-gray-500 space-y-1">
                  <div>"Schedule a meeting tomorrow at 2 PM"</div>
                  <div>"What's on my calendar today?"</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button
            size="lg"
            onClick={() => signIn()}
            disabled={isLoading}
            className="text-lg font-medium px-8 py-3"
          >
            Get Started with Google
          </Button>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <div className="flex items-center justify-center space-x-4">
            <span>Powered by Mistral AI</span>
            <div className="flex items-center space-x-1">
              <Shield className="h-4 w-4" />
              <span>Secure Google OAuth Integration</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
