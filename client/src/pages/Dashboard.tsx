import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  FolderGit2,
  ArrowRight,
  Settings,
  CheckCircle2,
} from "lucide-react";
import { GithubIcon } from "@/components/icons";

interface Project {
  id: string;
  name: string;
  github_repo_full_name: string;
  detected_platform: string | null;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  created: "bg-zinc-500",
  analyzing: "bg-blue-500",
  analyzed: "bg-cyan-500",
  migrating: "bg-amber-500",
  migrated: "bg-green-500",
  deploying: "bg-purple-500",
  deployed: "bg-emerald-500",
  failed: "bg-red-500",
};

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Project[]>("/projects")
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (searchParams.get("unlocked") === "true") {
      api
        .post<{ unlocked: boolean }>("/billing/verify-unlock")
        .then((res) => {
          if (res.unlocked) {
            toast.success(
              "Analyses unlocked! You can now run 2 more analyses.",
            );
          }
        })
        .catch(() => {
          toast.success(
            "Payment received! Your analyses will be unlocked shortly.",
          );
        });
    }
  }, [searchParams]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Migrate your vibe-coded apps to Vercel and Supabase
          </p>
        </div>
        <Button onClick={() => navigate("/new")} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          New Migration
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-32 bg-muted rounded" />
                <div className="h-4 w-48 bg-muted rounded mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <>
          {/* Onboarding: show getting-started steps when user has no projects */}
          {(!profile?.github_connected || !profile?.vercel_connected) && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Getting Started</CardTitle>
                <CardDescription>
                  Follow these steps to migrate your first project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${profile?.github_connected ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-primary text-primary-foreground"}`}
                    >
                      {profile?.github_connected ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        "1"
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Connect GitHub</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        We need access to read your repositories. Head to{" "}
                        <button
                          onClick={() => navigate("/settings")}
                          className="text-primary hover:underline"
                        >
                          Settings
                        </button>{" "}
                        and sign in with GitHub or paste a Personal Access
                        Token.
                      </p>
                      {!profile?.github_connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => navigate("/settings")}
                        >
                          <GithubIcon className="mr-2 h-3.5 w-3.5" />
                          Connect GitHub
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${profile?.github_connected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Create a Supabase project
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sign up at{" "}
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          supabase.com
                        </a>{" "}
                        and create a new project. You&apos;ll need the{" "}
                        <strong>Project URL</strong> and{" "}
                        <strong>anon key</strong> — find both under{" "}
                        <a
                          href="https://supabase.com/dashboard/project/_/settings/api"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Project Settings &rarr; API
                        </a>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-muted text-muted-foreground">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Start a migration</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Click <strong>New Migration</strong>, select a repo,
                        paste your Supabase credentials, and we&apos;ll analyze
                        the codebase. After reviewing the estimate, pay and the
                        AI migration runs automatically.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-muted text-muted-foreground">
                      4
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Push & deploy (optional)
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Once complete, push the migrated code to a new GitHub
                        repo and optionally deploy to Vercel. Connect Vercel in{" "}
                        <button
                          onClick={() => navigate("/settings")}
                          className="text-primary hover:underline"
                        >
                          Settings
                        </button>{" "}
                        when you&apos;re ready.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No projects yet</h3>
              <p className="text-muted-foreground text-sm mt-1 mb-4">
                {profile?.github_connected
                  ? "Import a GitHub repo to start migrating"
                  : "Connect GitHub first, then import a repo"}
              </p>
              <Button
                onClick={() =>
                  profile?.github_connected
                    ? navigate("/new")
                    : navigate("/settings")
                }
              >
                {profile?.github_connected ? (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    New Migration
                  </>
                ) : (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Go to Settings
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {!profile?.github_connected && (
            <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <GithubIcon className="h-5 w-5 text-amber-600" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Connect your GitHub account to import repositories
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/settings")}
                >
                  Connect GitHub
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs capitalize">
                      <span
                        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STATUS_COLORS[p.status] || "bg-gray-500"}`}
                      />
                      {p.status}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {p.github_repo_full_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    {p.detected_platform && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {p.detected_platform}
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
