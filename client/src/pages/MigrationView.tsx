import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCode,
  DollarSign,
  CreditCard,
  Rocket,
  GitBranch,
  GitFork,
  Loader2,
  Database,
  UserCheck,
  Info,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MigrationFile {
  id: string;
  file_path: string;
  status: string;
  changes_summary: { reason?: string } | null;
  input_tokens: number;
  output_tokens: number;
}

interface MigrationDetail {
  id: string;
  project_id: string;
  status: string;
  detected_platform: string | null;
  detected_services: string[];
  total_files: number;
  files_to_migrate: number;
  files_migrated: number;
  current_file: string | null;
  analysis_input_tokens: number;
  analysis_output_tokens: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_cents: number;
  is_deployed: boolean;
  output_type: string | null;
  output_repo_url: string | null;
  output_branch: string | null;
  error_message: string | null;
  migration_log: { timestamp: string; message: string; level: string }[];
  files: MigrationFile[];
  started_at: string | null;
  completed_at: string | null;
}

const FILE_STATUS_ICON: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  pending: Clock,
  migrating: Loader2,
  failed: AlertCircle,
  skipped: Clock,
};

export default function MigrationView() {
  const { profile } = useAuth();
  const { projectId, migrationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [migration, setMigration] = useState<MigrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [repoName, setRepoName] = useState("");
  const [pushType, setPushType] = useState<"new" | "branch">("new");
  const [addonDataMigration, setAddonDataMigration] = useState(false);
  const [addonCodeReview, setAddonCodeReview] = useState(false);
  const [postDeployChecks, setPostDeployChecks] = useState<
    Record<string, boolean>
  >({});

  async function fetchMigration() {
    try {
      const data = await api.get<MigrationDetail>(`/migrations/${migrationId}`);
      setMigration(data);
      if (!repoName && data.detected_platform) {
        setRepoName(`${data.detected_platform}-to-supabase`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const TERMINAL_STATUSES = new Set([
      "estimated",
      "completed",
      "failed",
      "budget_exceeded",
      "pending_review",
      "reviewed",
    ]);

    const load = async () => {
      try {
        const data = await api.get<MigrationDetail>(
          `/migrations/${migrationId}`,
        );
        if (!cancelled) {
          setMigration(data);
          if (!repoName && data.detected_platform) {
            setRepoName(`${data.detected_platform}-to-supabase`);
          }
          setLoading(false);

          if (TERMINAL_STATUSES.has(data.status) && interval) {
            clearInterval(interval);
            interval = null;
          }
          if (data.status === "completed" && migration?.status === "running") {
            toast.success("Migration completed successfully!");
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setLoading(false);
        }
      }
    };
    load();
    interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [migrationId, pollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-verify payment when returning from Stripe
  useEffect(() => {
    if (
      searchParams.get("paid") !== "true" ||
      migration?.status !== "estimated"
    )
      return;
    let cancelled = false;
    api
      .post<{ paid: boolean }>(`/migrations/${migrationId}/verify-payment`)
      .then((res) => {
        if (!cancelled && res.paid) {
          toast.success("Payment confirmed — migration started!");
          setPollKey((k) => k + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, migration?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-verify overage payment when returning from Stripe
  useEffect(() => {
    if (
      searchParams.get("overage_paid") !== "true" ||
      migration?.status !== "budget_exceeded"
    )
      return;
    let cancelled = false;
    api
      .post<{ paid: boolean }>(`/migrations/${migrationId}/verify-overage`)
      .then((res) => {
        if (!cancelled && res.paid) {
          toast.success("Overage payment confirmed — migration resuming!");
          setPollKey((k) => k + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, migration?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePayOverage() {
    setPaying(true);
    try {
      const res = await api.post<{ checkout_url?: string; paid?: boolean }>(
        `/migrations/${migrationId}/pay-overage`,
      );
      if (res.paid) {
        toast.success("Migration resuming!");
        setPollKey((k) => k + 1);
        setPaying(false);
      } else if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch {
      setPaying(false);
    }
  }

  async function handlePayAndStart() {
    setPaying(true);
    try {
      const res = await api.post<{ checkout_url?: string; paid?: boolean }>(
        `/migrations/${migrationId}/confirm`,
        {
          addon_data_migration: addonDataMigration,
          addon_code_review: addonCodeReview,
        },
      );
      if (res.paid) {
        toast.success("Migration started!");
        setPollKey((k) => k + 1);
        setPaying(false);
      } else if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch {
      setPaying(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setActionError(null);
    try {
      await api.post(`/migrations/${migrationId}/push`, {
        output_type: pushType,
        repo_name: repoName.trim() || undefined,
      });
      toast.success("Code pushed to GitHub successfully!");
      fetchMigration();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setPushing(false);
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    setActionError(null);
    try {
      await api.post(`/migrations/${migrationId}/deploy`);
      toast.success("Deploying to Vercel...");
      setPollKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      fetchMigration();
    } finally {
      setDeploying(false);
    }
  }

  if (loading || !migration) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const progress =
    migration.files_to_migrate > 0
      ? Math.round(
          (migration.files_migrated / migration.files_to_migrate) * 100,
        )
      : 0;

  const isAnalyzing = migration.status === "analyzing";
  const isRunning = migration.status === "running";
  const isEstimated = migration.status === "estimated";
  const isBuilding = migration.status === "building";
  const isFixing = migration.status === "fixing";
  const isBudgetExceeded = migration.status === "budget_exceeded";
  const deployed = migration.is_deployed === true;
  const isCompleted = migration.status === "completed";
  const isReviewed = migration.status === "reviewed";
  const isPendingReview =
    migration.status === "pending_review" || migration.status === "reviewing";
  const isFailed = migration.status === "failed";

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Button
        variant="ghost"
        onClick={() => navigate(`/project/${projectId}`)}
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Project
      </Button>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Migration</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            {migrationId?.slice(0, 8)}
          </p>
        </div>
        <Badge
          variant={
            isFailed
              ? "destructive"
              : isCompleted
                ? "default"
                : isBudgetExceeded
                  ? "outline"
                  : "secondary"
          }
          className={`text-sm capitalize ${isBudgetExceeded ? "border-amber-500 text-amber-500" : ""}`}
        >
          {isBudgetExceeded ? "budget exceeded" : migration.status}
        </Badge>
      </div>

      {/* Analysis results / cost estimate */}
      {(isEstimated || migration.detected_platform) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Platform
                </p>
                <p className="text-lg font-semibold capitalize mt-1">
                  {migration.detected_platform || "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Total Files
                </p>
                <p className="text-lg font-semibold mt-1">
                  {migration.total_files}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Files to Migrate
                </p>
                <p className="text-lg font-semibold mt-1">
                  {migration.files_to_migrate}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Services
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(migration.detected_services || []).map((s) => (
                    <Badge key={s} variant="outline" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {migration.analysis_input_tokens +
              migration.analysis_output_tokens >
              0 &&
              profile?.is_admin && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Analysis Token Usage
                  </p>
                  <p className="text-sm font-medium">
                    {(
                      migration.analysis_input_tokens +
                      migration.analysis_output_tokens
                    ).toLocaleString()}{" "}
                    tokens
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {migration.analysis_input_tokens.toLocaleString()} input /{" "}
                    {migration.analysis_output_tokens.toLocaleString()} output
                  </p>
                </div>
              )}

            {isEstimated &&
              (() => {
                const addonCents =
                  (addonDataMigration ? 2500 : 0) +
                  (addonCodeReview ? 7500 : 0);
                const totalCents = migration.estimated_cost_cents + addonCents;
                return (
                  <>
                    <Separator className="my-4" />
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Estimated Cost</p>
                        <p className="text-2xl font-bold">
                          ${(totalCents / 100).toFixed(2)}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          <p>$20.00 base fee</p>
                          <p>
                            $
                            {(
                              (migration.estimated_cost_cents - 2000) /
                              100
                            ).toFixed(2)}{" "}
                            token usage (~
                            {(
                              migration.estimated_input_tokens +
                              migration.estimated_output_tokens
                            ).toLocaleString()}{" "}
                            tokens)
                          </p>
                          {addonDataMigration && <p>$25.00 data migration</p>}
                          {addonCodeReview && <p>$75.00 code review</p>}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 my-4 p-4 rounded-lg border border-border bg-muted/30">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Optional Add-ons
                      </p>
                      <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-background hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={addonDataMigration}
                          onChange={(e) =>
                            setAddonDataMigration(e.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <Database className="h-3.5 w-3.5" />
                              Data Migration
                            </span>
                            <span className="text-sm font-semibold">+$25</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            AI reads your source code to reverse-engineer the
                            database schema your app depends on, then generates
                            a ready-to-run Supabase SQL migration file
                            including:
                          </p>
                          <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5 list-disc list-inside">
                            <li>
                              CREATE TABLE statements with proper PostgreSQL
                              types and constraints
                            </li>
                            <li>
                              Foreign key relationships and indexes based on
                              detected query patterns
                            </li>
                            <li>
                              Row Level Security (RLS) policies matched to your
                              auth flow
                            </li>
                          </ul>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            The output lands in{" "}
                            <code className="bg-muted px-1 rounded text-[11px]">
                              supabase/migrations/001_initial_schema.sql
                            </code>{" "}
                            and can be applied directly via the Supabase SQL
                            editor or CLI.
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-background hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={addonCodeReview}
                          onChange={(e) => setAddonCodeReview(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <UserCheck className="h-3.5 w-3.5" />
                              Senior Engineer Code Review
                            </span>
                            <span className="text-sm font-semibold">+$75</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            A senior engineer from our team manually reviews
                            your migrated codebase before delivery. The review
                            covers:
                          </p>
                          <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5 list-disc list-inside">
                            <li>
                              Security posture &mdash; exposed keys, auth gaps,
                              injection risks
                            </li>
                            <li>
                              Architecture &mdash; proper Supabase client usage,
                              code organization, separation of concerns
                            </li>
                            <li>
                              Performance &mdash; unnecessary re-renders,
                              missing indexes, N+1 queries
                            </li>
                            <li>
                              Bug detection &mdash; broken imports, dead code
                              paths, type mismatches
                            </li>
                            <li>
                              Scalability &mdash; connection pooling, caching
                              opportunities, rate-limit readiness
                            </li>
                            <li>
                              Migration completeness &mdash; no leftover
                              platform references or orphaned config
                            </li>
                          </ul>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Your migration will be held in a &ldquo;pending
                            review&rdquo; state until the review is complete.
                            Use code <strong>ARCRON</strong> at checkout for a
                            free review.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="lg"
                        onClick={handlePayAndStart}
                        disabled={paying}
                      >
                        {paying ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="mr-2 h-4 w-4" />
                        )}
                        {paying
                          ? "Redirecting..."
                          : `Pay $${(totalCents / 100).toFixed(2)} & Start`}
                      </Button>
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">
                          Please read before proceeding:
                        </strong>{" "}
                        Yougrate uses AI to rewrite your code. While we make
                        best-effort attempts to produce a working migration —
                        including automatic build error detection and up to 3
                        AI-driven fix cycles — the output is not guaranteed to
                        be error-free or production-ready. You may need to
                        review and adjust the migrated code yourself. Yougrate
                        is not responsible for bugs, data loss, or downtime
                        resulting from migrated code. Your original repository
                        is never modified. By proceeding with payment, you
                        acknowledge these limitations and agree that all sales
                        are final. Need help with your migrated code?{" "}
                        <a
                          href="https://arcron.systems"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Arcron Information Systems
                        </a>{" "}
                        offers professional software services that can assist
                        with any issues — reach out at{" "}
                        <a
                          href="mailto:yougrate@arcron.systems"
                          className="text-primary hover:underline"
                        >
                          yougrate@arcron.systems
                        </a>
                        .
                      </p>
                    </div>
                  </>
                );
              })()}
          </CardContent>
        </Card>
      )}

      {/* Analyzing indicator */}
      {isAnalyzing && (
        <Card className="mb-6">
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <div>
                <p className="text-sm font-medium">
                  Analyzing your codebase...
                </p>
                <p className="text-xs text-muted-foreground">
                  Reviewing files for platform-specific code. Check the log
                  below for details.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              You can safely close this tab or refresh the page — your analysis
              will continue running on our servers.
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Analysis stalled or disconnected? Resume from where it left off.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api.post(`/migrations/${migrationId}/retry`);
                    toast.success("Resuming analysis...");
                    setPollKey((k) => k + 1);
                  } catch (err: unknown) {
                    const msg =
                      err instanceof Error ? err.message : String(err);
                    toast.error(msg);
                  }
                }}
              >
                <Rocket className="mr-2 h-3 w-3" />
                Resume Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration progress */}
      {(isRunning || isCompleted) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Migration Progress</CardTitle>
            {migration.current_file && (
              <CardDescription className="font-mono text-xs">
                {migration.current_file}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="mb-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {migration.files_migrated} / {migration.files_to_migrate} files
              </span>
              <span>{progress}%</span>
            </div>
            {isRunning && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0" />
                  You can safely close this tab or refresh the page — your
                  migration will continue running on our servers.
                </div>
                <p className="text-xs text-muted-foreground">
                  Migration stalled or disconnected? Resume from where it left
                  off.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await api.post(`/migrations/${migrationId}/retry`);
                      toast.success("Resuming migration...");
                      setPollKey((k) => k + 1);
                    } catch (err: unknown) {
                      const msg =
                        err instanceof Error ? err.message : String(err);
                      toast.error(msg);
                    }
                  }}
                >
                  <Rocket className="mr-2 h-3 w-3" />
                  Resume Migration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Budget exceeded — pay overage to continue */}
      {isBudgetExceeded && (
        <Card className="mb-6 border-amber-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Token Budget Exceeded
            </CardTitle>
            <CardDescription>
              {migration.files_migrated} of {migration.files_to_migrate} files
              completed before the budget cap was reached.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress
              value={
                migration.files_to_migrate > 0
                  ? Math.round(
                      (migration.files_migrated / migration.files_to_migrate) *
                        100,
                    )
                  : 0
              }
              className="mb-4"
            />
            {migration.error_message && (
              <p className="text-sm text-muted-foreground mb-4">
                {migration.error_message}
              </p>
            )}
            <div className="flex items-center gap-4">
              <Button onClick={handlePayOverage} disabled={paying}>
                {paying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {paying ? "Redirecting..." : "Pay & Continue Migration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending review */}
      {isPendingReview && (
        <Card className="mb-6 border-amber-500">
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium">
                  Awaiting Senior Engineer Code Review
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your migration is complete and has been queued for review by a
                  senior engineer.
                  {migration.status === "reviewing"
                    ? " Review is in progress."
                    : " We'll notify you when it's done."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviewed */}
      {isReviewed && (
        <Card className="mb-6 border-green-500">
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Code Review Complete</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your migrated code has been reviewed by a senior engineer and
                  is ready for use.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Push migrated code */}
      {(isCompleted || isReviewed) && !migration.output_repo_url && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Push Migrated Code</CardTitle>
            <CardDescription>
              Choose where to push the migrated code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={pushType === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setPushType("new")}
              >
                <GitFork className="mr-2 h-4 w-4" />
                New Repository
              </Button>
              <Button
                variant={pushType === "branch" ? "default" : "outline"}
                size="sm"
                onClick={() => setPushType("branch")}
              >
                <GitBranch className="mr-2 h-4 w-4" />
                Branch on Original
              </Button>
            </div>

            {pushType === "new" && (
              <div>
                <Label htmlFor="repo-name">Repository Name</Label>
                <Input
                  id="repo-name"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-app-supabase"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A new private repo will be created under your GitHub account.
                </p>
              </div>
            )}

            <Button
              onClick={handlePush}
              disabled={
                pushing || (pushType === "new" && !repoName.trim())
              }
            >
              {pushing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-2 h-4 w-4" />
              )}
              {pushing ? "Pushing..." : "Push Code"}
            </Button>
          </CardContent>
        </Card>
      )}

      {migration.output_repo_url && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Code Pushed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Repository</p>
              <a
                href={migration.output_repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline font-mono"
              >
                {migration.output_repo_url}
              </a>
            </div>
            {migration.output_branch && (
              <div>
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="text-sm font-mono">{migration.output_branch}</p>
              </div>
            )}
            {!isBuilding && !isFixing && !deployed && (
              <Button onClick={handleDeploy} disabled={deploying}>
                <Rocket className="mr-2 h-4 w-4" />
                {deploying ? "Deploying..." : "Deploy to Vercel"}
              </Button>
            )}
            {deployed && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Deployed successfully
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeploy}
                  disabled={deploying}
                >
                  {deploying ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Rocket className="mr-2 h-3 w-3" />
                  )}
                  {deploying ? "Redeploying..." : "Redeploy"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Post-deploy checklist */}
      {deployed && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Post-Deploy Checklist</CardTitle>
            <CardDescription>
              Complete these steps to make your migrated app production-ready
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const items = [
                {
                  id: "env_vars",
                  title: "Set environment variables in Vercel",
                  detail: (
                    <>
                      Your app needs{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        NEXT_PUBLIC_SUPABASE_URL
                      </code>{" "}
                      and{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        NEXT_PUBLIC_SUPABASE_ANON_KEY
                      </code>{" "}
                      (or the{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        VITE_
                      </code>{" "}
                      equivalents for Vite apps). Add any other env vars your
                      app uses.
                    </>
                  ),
                  link: {
                    label: "Vercel Environment Variables",
                    url: "https://vercel.com/docs/projects/environment-variables",
                  },
                },
                {
                  id: "supabase_auth",
                  title: "Configure Supabase auth redirect URLs",
                  detail: (
                    <>
                      In your Supabase dashboard under{" "}
                      <strong>Authentication &rarr; URL Configuration</strong>,
                      add your Vercel domain to the{" "}
                      <strong>Redirect URLs</strong> list (e.g.{" "}
                      <code className="bg-muted px-1 rounded text-xs">
                        https://your-app.vercel.app/**
                      </code>
                      ).
                    </>
                  ),
                  link: {
                    label: "Supabase Auth Settings",
                    url: "https://supabase.com/dashboard/project/_/auth/url-configuration",
                  },
                },
                {
                  id: "custom_domain",
                  title: "Add a custom domain (optional)",
                  detail:
                    "Point your domain to Vercel for a branded URL. Update Supabase redirect URLs if you do.",
                  link: {
                    label: "Vercel Custom Domains",
                    url: "https://vercel.com/docs/projects/domains",
                  },
                },
                {
                  id: "supabase_rls",
                  title: "Review Row Level Security policies",
                  detail:
                    "Ensure RLS is enabled on all tables and policies match your auth requirements. Without RLS, your data is publicly accessible.",
                  link: {
                    label: "Supabase RLS Guide",
                    url: "https://supabase.com/docs/guides/database/postgres/row-level-security",
                  },
                },
                {
                  id: "test_auth",
                  title: "Test login and signup flows",
                  detail:
                    "Sign up a test user, verify email confirmation works, and test all auth-gated pages. Check browser console for errors.",
                },
                {
                  id: "test_data",
                  title: "Verify database operations",
                  detail:
                    "Create, read, update, and delete records through your app. Check that data persists correctly in Supabase.",
                },
                {
                  id: "check_builds",
                  title: "Review Vercel build logs",
                  detail:
                    "Look for warnings about missing dependencies, large bundle sizes, or deprecated APIs that could cause issues.",
                  link: {
                    label: "Vercel Deployments",
                    url: "https://vercel.com/dashboard",
                  },
                },
                {
                  id: "cleanup",
                  title: "Remove leftover platform references",
                  detail:
                    "Search for any remaining mentions of the original platform in README, package.json metadata, or HTML meta tags.",
                },
              ];

              const checked =
                Object.values(postDeployChecks).filter(Boolean).length;

              return (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-3">
                    {checked}/{items.length} completed
                  </p>
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                        postDeployChecks[item.id]
                          ? "bg-muted/30 border-border/50"
                          : "bg-background border-border hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={postDeployChecks[item.id] || false}
                        onChange={(e) =>
                          setPostDeployChecks((prev) => ({
                            ...prev,
                            [item.id]: e.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${postDeployChecks[item.id] ? "line-through text-muted-foreground" : ""}`}
                        >
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {item.detail}
                        </p>
                        {item.link && (
                          <a
                            href={item.link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.link.label}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Build progress (Vercel build + AI fix loop) */}
      {(isBuilding || isFixing) && (
        <Card className="mb-6">
          <CardContent className="py-6 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
              <div>
                <p className="text-sm font-medium">
                  {isFixing
                    ? "Fixing build errors..."
                    : "Building on Vercel..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isFixing
                    ? "AI is analyzing build errors and applying fixes. A new build will start automatically."
                    : "Waiting for Vercel to build and deploy. If errors occur, they'll be fixed automatically."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              You can safely close this tab or refresh the page — your build
              will continue running on our servers.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action error (push/deploy) */}
      {actionError && (
        <Card className="mb-6 border-destructive">
          <CardContent className="py-4 overflow-auto">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Action Failed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {actionError}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment error */}
      {isFailed && migration.error_message && migration.output_repo_url && (
        <Card className="mb-6 border-destructive">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">
                  Deployment Failed
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {migration.error_message}
                </p>
                <div className="mt-3">
                  <Button size="sm" onClick={handleDeploy} disabled={deploying}>
                    {deploying ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Rocket className="mr-2 h-3 w-3" />
                    )}
                    {deploying ? "Redeploying..." : "Retry Deployment"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration error */}
      {isFailed && migration.error_message && !migration.output_repo_url && (
        <Card className="mb-6 border-destructive">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Migration Failed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {migration.error_message}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await api.post<{ status: string }>(
                          `/migrations/${migrationId}/retry`,
                        );
                        const label =
                          res.status === "retrying_migration"
                            ? "Resuming migration..."
                            : "Retrying analysis...";
                        toast.success(label);
                        setPollKey((k) => k + 1);
                      } catch (err: unknown) {
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        toast.error(msg);
                      }
                    }}
                  >
                    <Rocket className="mr-2 h-3 w-3" />
                    Retry
                  </Button>
                  {migration.error_message.includes("capacity") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await api.post(`/migrations/${migrationId}/retry`, {
                            model: "claude-opus-4-6-20250115",
                          });
                          toast.success("Retrying analysis with Opus 4.6...");
                          setPollKey((k) => k + 1);
                        } catch (err: unknown) {
                          const msg =
                            err instanceof Error ? err.message : String(err);
                          toast.error(msg);
                        }
                      }}
                    >
                      <Rocket className="mr-2 h-3 w-3" />
                      Retry with Opus 4.6
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Files list */}
      {migration.files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Files ({migration.files.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y max-h-80 overflow-y-auto">
              {migration.files.map((f) => {
                const Icon = FILE_STATUS_ICON[f.status] || Clock;
                const reason = f.changes_summary?.reason;
                return (
                  <div key={f.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          f.status === "completed"
                            ? "text-green-600"
                            : f.status === "failed"
                              ? "text-red-500"
                              : f.status === "migrating"
                                ? "animate-spin text-blue-500"
                                : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-sm font-mono truncate flex-1">
                        {f.file_path}
                      </span>
                      {f.input_tokens + f.output_tokens > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {(f.input_tokens + f.output_tokens).toLocaleString()}{" "}
                          tokens
                        </span>
                      )}
                    </div>
                    {reason && (
                      <p className="text-xs text-muted-foreground ml-7 mt-1">
                        {reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log */}
      {migration.migration_log.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 font-mono text-xs max-h-96 overflow-y-auto">
              {migration.migration_log.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${
                    entry.level === "error"
                      ? "text-red-500"
                      : entry.level === "warn"
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  }`}
                >
                  <span className="shrink-0 text-muted-foreground/50">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="whitespace-pre-wrap break-all">
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
