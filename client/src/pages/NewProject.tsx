import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Lock, Globe, Info, AlertCircle } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import { toast } from "sonner";

interface GithubRepo {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  language: string | null;
  updated_at: string;
}

export default function NewProject() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(!!profile?.github_connected);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  useEffect(() => {
    if (!profile?.github_connected) return;
    let cancelled = false;
    api
      .get<GithubRepo[]>("/projects/github/repos")
      .then((data) => { if (!cancelled) setRepos(data); })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("expired") || msg.includes("token") || msg.includes("401")) {
          setTokenExpired(true);
        } else {
          toast.error("Failed to load repositories");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile]);

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleCreate() {
    if (!selectedRepo) return;
    setCreating(true);
    try {
      const project = await api.post<{ id: string }>("/projects", {
        name: selectedRepo.name,
        github_repo_url: selectedRepo.html_url,
        github_repo_full_name: selectedRepo.full_name,
        default_branch: selectedRepo.default_branch,
      });

      if (supabaseUrl && supabaseKey) {
        await api.patch(`/projects/${project.id}/supabase`, {
          supabase_url: supabaseUrl,
          supabase_anon_key: supabaseKey,
        });
      }

      const migration = await api.post<{ id: string }>("/migrations", {
        project_id: project.id,
      });

      navigate(`/project/${project.id}/migration/${migration.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  if (!profile?.github_connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <GithubIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Connect GitHub</CardTitle>
            <CardDescription>
              You need to connect your GitHub account before importing a
              repository.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => navigate("/settings")}>
              Go to Settings
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2">New Migration</h1>
      <p className="text-muted-foreground mb-8">
        Select a repository and configure your Supabase project
      </p>

      {/* Step 1: Select repo */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">1. Select Repository</CardTitle>
          <CardDescription>Choose the repo you want to migrate</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedRepo ? (
            <div className="flex items-center justify-between bg-muted rounded-lg p-4">
              <div className="flex items-center gap-3">
                <GithubIcon className="h-5 w-5" />
                <div>
                  <p className="font-medium text-sm">
                    {selectedRepo.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedRepo.language} · {selectedRepo.default_branch}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRepo(null)}
              >
                Change
              </Button>
            </div>
          ) : tokenExpired ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    GitHub token expired
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Your GitHub access token has expired. Reconnect your account to load repositories.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/settings")}
                  >
                    <GithubIcon className="mr-2 h-3.5 w-3.5" />
                    Reconnect GitHub
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
                {loading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Loading repositories...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No repositories found
                  </div>
                ) : (
                  filtered.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => setSelectedRepo(repo)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                    >
                      {repo.private ? (
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {repo.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {repo.language || "Unknown"} · Updated{" "}
                          {new Date(repo.updated_at!).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Supabase config */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">2. Connect Supabase Project</CardTitle>
          <CardDescription>
            Enter your Supabase project credentials (can be done later)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Find both values in your{" "}
              <a
                href="https://supabase.com/dashboard/project/_/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Supabase dashboard
              </a>
              {" "}under <strong>Project Settings &rarr; API</strong>. The URL is listed as "Project URL" and the anon key is under "Project API keys" (the one labeled <code className="bg-muted px-1 rounded">anon</code> / <code className="bg-muted px-1 rounded">public</code>).
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supabase-url">Supabase URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://abcdefghijkl.supabase.co"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Looks like <code className="bg-muted px-1 rounded">https://&lt;project-id&gt;.supabase.co</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supabase-key">Anon Key</Label>
            <Input
              id="supabase-key"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The public <code className="bg-muted px-1 rounded">anon</code> key — safe to embed in client-side code
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleCreate}
        disabled={!selectedRepo || creating}
        size="lg"
        className="w-full"
      >
        {creating ? "Analyzing repository..." : "Start Analysis"}
      </Button>
    </div>
  );
}
