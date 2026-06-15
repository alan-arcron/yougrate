import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GithubIcon } from "@/components/icons";

export default function Login() {
  const { signInWithGitHub } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <a
          href="/"
          className="block text-center hover:opacity-80 transition-opacity"
        >
          <img
            src="/yougrate.png"
            alt="Yougrate"
            className="h-16 w-16 mx-auto mb-3"
          />
          <h1
            className="text-4xl tracking-tight"
            style={{ fontFamily: "'Righteous', cursive" }}
          >
            Yougrate
          </h1>
          <p className="text-muted-foreground mt-2">
            Migrate vibe-coded apps to Supabase and Vercel in minutes
          </p>
        </a>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Sign in with GitHub to start migrating your projects. You'll need a
              GitHub account first —{" "}
              <a
                href="https://github.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                create one for free
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={signInWithGitHub}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <GithubIcon className="mr-2 h-5 w-5" />
              Continue with GitHub
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
