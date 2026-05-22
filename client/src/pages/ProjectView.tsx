import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, ExternalLink, Loader2, Lock, CreditCard } from "lucide-react";

interface ProjectDetail {
  id: string;
  name: string;
  github_repo_full_name: string;
  github_repo_url: string;
  detected_platform: string | null;
  supabase_url: string | null;
  status: string;
  created_at: string;
  migrations: {
    id: string;
    status: string;
    files_to_migrate: number;
    files_migrated: number;
    estimated_cost_cents: number;
    created_at: string;
  }[];
}

export default function ProjectView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    api.get<ProjectDetail>(`/projects/${projectId}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function startNewMigration() {
    try {
      const migration = await api.post<{ id: string }>("/migrations", {
        project_id: projectId,
      });
      navigate(`/project/${projectId}/migration/${migration.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("free analyses") || msg.includes("quota")) {
        setQuotaBlocked(true);
      } else if (msg.includes("already been analyzed")) {
        toast.info("This repository has already been analyzed.");
      } else {
        toast.error(msg);
      }
    }
  }

  async function handleUnlockAnalyses() {
    setUnlocking(true);
    try {
      const { checkout_url } = await api.post<{ checkout_url: string }>("/billing/unlock-analyses");
      window.location.href = checkout_url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setUnlocking(false);
    }
  }

  if (loading || !project) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <a
              href={project.github_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-primary font-mono flex items-center gap-1 mt-1"
            >
              {project.github_repo_full_name}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {!["analyzed", "migrated", "deployed", "estimated"].includes(project.status) && (
            <Button onClick={startNewMigration}>
              <Plus className="mr-2 h-4 w-4" />
              New Migration
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
              <p className="text-lg font-semibold capitalize mt-1">{project.status}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Platform</p>
              <p className="text-lg font-semibold capitalize mt-1">
                {project.detected_platform || "Pending"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Supabase</p>
              <p className="text-lg font-semibold mt-1">
                {project.supabase_url ? "Connected" : "Not connected"}
              </p>
            </CardContent>
          </Card>
        </div>

        {quotaBlocked && (
          <Card className="mb-6 border-amber-500/50">
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Analysis limit reached</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You've used all your free analyses. Pay $10 to cover previous usage and unlock 2 more analyses.
                  </p>
                  <Button size="sm" className="mt-3" onClick={handleUnlockAnalyses} disabled={unlocking}>
                    {unlocking ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 h-3 w-3" />
                    )}
                    {unlocking ? "Redirecting..." : "Unlock Analyses — $10"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Migrations</CardTitle>
            <CardDescription>Past and current migration runs</CardDescription>
          </CardHeader>
          <CardContent>
            {project.migrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No migrations yet
              </p>
            ) : (
              <div className="divide-y">
                {project.migrations.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/project/${projectId}/migration/${m.id}`)}
                    className="w-full flex items-center justify-between py-3 text-left hover:bg-muted/50 px-2 rounded transition-colors"
                  >
                    <div>
                      <p className="text-sm font-mono">{m.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {m.estimated_cost_cents > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ${(m.estimated_cost_cents / 100).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {m.files_migrated}/{m.files_to_migrate} files
                      </span>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {m.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
