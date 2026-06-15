import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Search,
  Lock,
  Globe,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
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

      const migration = await api.post<{ id: string }>("/migrations", {
        project_id: project.id,
      });

      navigate(`/project/${project.id}/migration/${migration.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("free analyses") ||
        msg.toLowerCase().includes("quota")
      ) {
        toast.error(
          "You've used all your free analyses. Unlock more from your dashboard.",
        );
        navigate("/dashboard");
      } else {
        toast.error(msg);
      }
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
      <p className="text-muted-foreground mb-6">
        Select a repository to analyze. You&apos;ll add your Supabase project
        after reviewing the estimate.
      </p>

      {/* Select repo */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Select Repository</CardTitle>
          <CardDescription>Choose the repo you want to migrate</CardDescription>
        </CardHeader>
        <CardContent>
          {tokenExpired ? (
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
                  filtered.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    return (
                      <button
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo)}
                        aria-pressed={isSelected}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-l-2 border-primary"
                            : "hover:bg-muted"
                        }`}
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
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
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
