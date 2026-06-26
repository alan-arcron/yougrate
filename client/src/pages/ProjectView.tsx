import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ExternalLink, Loader2, Lock, CreditCard, Pencil, Check, X, Info, ChevronRight } from "lucide-react";
import {
  SupabaseConnectFields,
  refToUrl,
  urlToRef,
} from "@/components/SupabaseConnectFields";

interface ProjectDetail {
  id: string;
  name: string;
  github_repo_full_name: string;
  github_repo_url: string;
  detected_platform: string | null;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  has_db_url?: boolean;
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
  const [editingSupabase, setEditingSupabase] = useState(false);
  const [supabaseProjectId, setSupabaseProjectId] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [savingSupabase, setSavingSupabase] = useState(false);

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

        {!["analyzed", "migrated", "deployed", "estimated"].includes(project.status) && (
          <div className="mb-8 flex items-start gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm leading-relaxed">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                Should I migrate?
              </p>
              <p className="text-muted-foreground mt-1">
                Migrating moves your app off the no-code platform so you fully
                own the code and run it on your own Supabase and Vercel &mdash;
                no more monthly platform lock-in or per-seat pricing. It&apos;s a
                great fit once your idea is validated and you want to control
                costs and customize freely. If you&apos;re still rapidly
                prototyping, it may be worth staying put a little longer. Not
                sure?{" "}
                <a
                  href="mailto:yougrate@arcron.systems"
                  className="text-primary hover:underline"
                >
                  Reach out
                </a>{" "}
                and we&apos;ll help you decide.
              </p>
            </div>
          </div>
        )}

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
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Supabase</p>
                <button
                  onClick={() => {
                    setEditingSupabase(!editingSupabase);
                    setSupabaseProjectId(urlToRef(project.supabase_url));
                    setSupabaseKey(project.supabase_anon_key || "");
                    setConnectionString("");
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-lg font-semibold mt-1">
                {project.supabase_url ? "Connected" : "Not connected"}
              </p>
              {project.supabase_url && !editingSupabase && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {project.supabase_url}
                </p>
              )}
              {!editingSupabase && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Connection string:{" "}
                  {project.has_db_url ? "saved" : "not set"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {editingSupabase && (
          <Card className="mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Supabase Settings</CardTitle>
              <CardDescription>
                Update the Supabase project this migration targets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SupabaseConnectFields
                idPrefix="proj"
                projectId={supabaseProjectId}
                onProjectIdChange={setSupabaseProjectId}
                anonKey={supabaseKey}
                onAnonKeyChange={setSupabaseKey}
                connString={connectionString}
                onConnStringChange={setConnectionString}
                connNote={
                  project.has_db_url
                    ? "A connection string is already saved (encrypted). Leave blank to keep it, or paste a new one to replace it."
                    : undefined
                }
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={savingSupabase}
                  onClick={async () => {
                    setSavingSupabase(true);
                    try {
                      const updated = await api.patch<ProjectDetail>(
                        `/projects/${projectId}/supabase`,
                        {
                          supabase_url: refToUrl(supabaseProjectId) || null,
                          supabase_anon_key: supabaseKey || null,
                          connection_string: connectionString.trim() || undefined,
                        },
                      );
                      setProject((prev) => prev ? { ...prev, supabase_url: updated.supabase_url, supabase_anon_key: updated.supabase_anon_key, has_db_url: updated.has_db_url } : prev);
                      setConnectionString("");
                      setEditingSupabase(false);
                      toast.success("Supabase settings updated");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to update Supabase settings");
                    } finally {
                      setSavingSupabase(false);
                    }
                  }}
                >
                  <Check className="mr-1.5 h-3 w-3" />
                  {savingSupabase ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingSupabase(false)}
                >
                  <X className="mr-1.5 h-3 w-3" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
