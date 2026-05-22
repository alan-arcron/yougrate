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
import { ArrowLeft, Search, Lock, Globe } from "lucide-react";
import { GithubIcon } from "@/components/icons";

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
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);

  useEffect(() => {
    if (!profile?.github_connected) return;
    setLoading(true);
    api
      .get<GithubRepo[]>("/projects/github/repos")
      .then(setRepos)
      .catch(console.error)
      .finally(() => setLoading(false));
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
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Button
        variant="ghost"
        onClick={() => navigate("/dashboard")}
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

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
          <div className="space-y-2">
            <Label htmlFor="supabase-url">Supabase URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://your-project.supabase.co"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supabase-key">Anon Key</Label>
            <Input
              id="supabase-key"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
            />
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
