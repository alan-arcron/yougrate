import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
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
  TrendingDown,
  KeyRound,
  Server,
  Zap,
  Upload,
  Download,
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
  backend_type: "supabase_only" | "edge_functions" | "server" | null;
  backend_details: {
    reason?: string;
    server_dir?: string;
    start_command?: string;
    edge_functions?: string[];
  } | null;
  railway_project_id: string | null;
  railway_service_id: string | null;
  railway_service_domain: string | null;
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
  committed_secrets: string[];
  addon_code_review: boolean;
  addon_data_migration: boolean;
  review_notes: string | null;
  reviewed_at: string | null;
  has_review_artifact: boolean;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  has_db_url: boolean;
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

function BreakEvenCalculator({
  migrationCostCents,
  platform,
  monthlySpend,
  setMonthlySpend,
  claudeSpend,
  setClaudeSpend,
}: {
  migrationCostCents: number;
  platform: string | null;
  monthlySpend: string | null;
  setMonthlySpend: (v: string) => void;
  claudeSpend: string;
  setClaudeSpend: (v: string) => void;
}) {
  const platformLabels: Record<string, string> = {
    base44: "Base44",
    lovable: "Lovable",
    replit: "Replit",
    bolt: "Bolt",
  };
  const platformDefaults: Record<string, number> = {
    base44: 40,
    lovable: 25,
    replit: 25,
    bolt: 20,
  };
  const platformKey = platform ?? "";
  const platformLabel = platformLabels[platformKey] ?? "your old platform";
  // Until the user edits the field, fall back to a per-platform default.
  const effectiveSpend =
    monthlySpend ?? String(platformDefaults[platformKey] ?? 30);

  const migrationCost = migrationCostCents / 100;
  const current = parseFloat(effectiveSpend) || 0;
  const claude = parseFloat(claudeSpend) || 0;
  const savings = current - claude;
  const rawMonths = savings > 0 ? migrationCost / savings : null;
  const months = rawMonths === null ? null : Math.max(1, Math.ceil(rawMonths));
  return (
    <div className="my-4 p-4 rounded-lg border border-green-600/30 bg-green-600/5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-4 w-4 text-green-600" />
        <p className="text-sm font-medium">When this pays for itself</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground">
            Current cost on {platformLabel} / mo
          </span>
          <div className="relative mt-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={effectiveSpend}
              onChange={(e) => setMonthlySpend(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 text-sm rounded-md border border-border bg-white"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">
            Cost on Claude (Pro) / mo
          </span>
          <div className="relative mt-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={claudeSpend}
              onChange={(e) => setClaudeSpend(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 text-sm rounded-md border border-border bg-white"
            />
          </div>
        </label>
      </div>
      {months !== null ? (
        <p className="text-sm mt-3">
          Break even in{" "}
          <strong className="text-green-700 dark:text-green-500">
            ~{months} month{months === 1 ? "" : "s"}
          </strong>
          , then save{" "}
          <strong className="text-green-700 dark:text-green-500">
            ${savings.toFixed(0)}/mo
          </strong>{" "}
          after that.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mt-3">
          Enter a current cost higher than your Claude cost to see your
          break-even point.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-1.5">
        One-time migration of ${migrationCost.toFixed(2)}
        {savings > 0 ? ` ÷ $${savings.toFixed(0)}/mo saved` : ""}. Estimate only
        — adjust the numbers to match your plans.
      </p>
    </div>
  );
}

function BackendBanner({
  type,
  details,
}: {
  type: MigrationDetail["backend_type"];
  details: MigrationDetail["backend_details"];
}) {
  if (!type) return null;

  if (type === "supabase_only") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Zap className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
        <p className="leading-relaxed">
          <span className="font-medium text-foreground">Fully serverless.</span>{" "}
          This app talks directly to Supabase, so it deploys cleanly to Vercel +
          Supabase with no separate backend to host.
        </p>
      </div>
    );
  }

  if (type === "edge_functions") {
    const fns = details?.edge_functions ?? [];
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <Zap className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="leading-relaxed space-y-1">
          <p>
            <span className="font-medium">
              Uses serverless backend functions.
            </span>{" "}
            {fns.length > 0
              ? `Detected ${fns.length} function(s): ${fns.join(", ")}. `
              : ""}
            These run as Supabase Edge Functions, not on Vercel. After your
            migration you&apos;ll deploy them to your Supabase project
            (one-click automation coming soon).
          </p>
          <a
            href="https://supabase.com/docs/guides/functions/deploy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-amber-900 underline"
          >
            How to deploy Edge Functions
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  // type === "server"
  const dir =
    details?.server_dir && details.server_dir !== "."
      ? details.server_dir
      : null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800">
      <Server className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="leading-relaxed space-y-1">
        <p>
          <span className="font-medium">
            This app needs a persistent backend server
          </span>
          {dir ? (
            <>
              {" "}
              (detected in <code className="font-mono">{dir}/</code>)
            </>
          ) : null}
          , which Vercel can&apos;t host. The frontend still deploys to Vercel;
          after you push your code, use the{" "}
          <span className="font-medium">Backend Server (Railway)</span> section
          below to deploy the server to{" "}
          <a
            href="https://railway.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-red-900 underline"
          >
            Railway
            <ExternalLink className="h-3 w-3" />
          </a>{" "}
          (~$5/mo).
        </p>
        {details?.start_command ? (
          <p className="text-[11px]">
            Start command:{" "}
            <code className="font-mono">{details.start_command}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Preview the variable names in pasted .env text (client-side only, for display).
 * Mirrors the server parser but returns just the keys — values are never shown.
 */
function previewEnvKeys(text: string): string[] {
  const keys: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Build the public Supabase URL from a project ref/ID. */
function refToUrl(ref: string): string {
  return ref ? `https://${ref}.supabase.co` : "";
}

/** Extract the project ref/ID from a Supabase URL (e.g. https://<ref>.supabase.co). */
function urlToRef(url: string | null | undefined): string {
  if (!url) return "";
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(co|com)/i);
  return m ? m[1] : "";
}

/** Normalize whatever the user pastes into a bare project ref. */
function normalizeRef(input: string): string {
  const raw = input.trim();
  if (raw.includes("supabase.")) return urlToRef(raw);
  return raw.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Client-side sanity check for a pasted Supabase connection string, so users
 * see a clear error BEFORE paying instead of a cryptic failure when we try to
 * apply the schema. Returns an error message, or null if it's empty (optional)
 * or looks valid. Mirrors the server's validateSupabaseConnectionString.
 */
function validateConnString(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null; // optional — they can add it later
  if (/\[YOUR-PASSWORD\]|<password>|\[password\]|YOUR-PASSWORD/i.test(s)) {
    return "Replace [YOUR-PASSWORD] with your actual database password.";
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return "That doesn't look like a valid connection string — it should start with postgresql:// and come from Supabase's Connect dialog.";
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return "Connection string must start with postgresql://";
  }
  const host = url.hostname.toLowerCase();
  if (!(host.endsWith(".supabase.co") || host.endsWith(".supabase.com"))) {
    return "Use your Supabase database host (ends in .supabase.com). Copy the Session pooler URI from the Connect dialog.";
  }
  if (!url.password) {
    return "Your connection string is missing the password (postgres.<ref>:<password>@…).";
  }
  return null;
}

/**
 * Non-blocking heads-up for the IPv6-only direct host, which won't connect from
 * our servers. Returns a warning message, or null.
 */
function connStringWarning(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    return "This is the direct connection (IPv6-only) — it usually can't be reached from our servers. Use the Session pooler URI instead (aws-…pooler.supabase.com).";
  }
  return null;
}

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
  const [deployingDirect, setDeployingDirect] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [repoName, setRepoName] = useState("");
  const [pushType, setPushType] = useState<"new" | "branch">("new");
  const [addonCodeReview, setAddonCodeReview] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null);
  const [supabaseProjectId, setSupabaseProjectId] = useState<string | null>(
    null,
  );
  const [supabaseKey, setSupabaseKey] = useState<string | null>(null);
  const [monthlySpend, setMonthlySpend] = useState<string | null>(null);
  const [claudeSpend, setClaudeSpend] = useState("20");
  const [dbConnString, setDbConnString] = useState("");
  const [rememberDbConn, setRememberDbConn] = useState(false);
  const [applyingSchema, setApplyingSchema] = useState(false);
  const [schemaApplied, setSchemaApplied] = useState(false);
  const [envText, setEnvText] = useState("");
  const [pushingEnv, setPushingEnv] = useState(false);
  const [pushedEnvKeys, setPushedEnvKeys] = useState<string[] | null>(null);
  const [deployingRailway, setDeployingRailway] = useState(false);
  const [railwayGithubHelp, setRailwayGithubHelp] = useState<string | null>(
    null,
  );
  const [railwayEnvText, setRailwayEnvText] = useState("");
  const [pushingRailwayEnv, setPushingRailwayEnv] = useState(false);
  const [pushedRailwayEnvKeys, setPushedRailwayEnvKeys] = useState<
    string[] | null
  >(null);
  const [postDeployChecks, setPostDeployChecks] = useState<
    Record<string, boolean>
  >({});
  const [downloadingReview, setDownloadingReview] = useState(false);
  const [pushingReview, setPushingReview] = useState(false);
  const [reviewBranchUrl, setReviewBranchUrl] = useState<string | null>(null);

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

  // Auto-verify code review payment when returning from Stripe
  useEffect(() => {
    if (searchParams.get("review_paid") !== "true") return;
    let cancelled = false;
    api
      .post<{ paid: boolean }>(`/migrations/${migrationId}/verify-review`)
      .then((res) => {
        if (!cancelled && res.paid) {
          toast.success("Payment confirmed — code review requested!");
          setPollKey((k) => k + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const url = (supabaseUrl ?? migration?.supabase_url ?? "").trim();
    const key = (supabaseKey ?? migration?.supabase_anon_key ?? "").trim();
    if (!url || !key) {
      toast.error("Enter your Supabase URL and anon key before continuing.");
      return;
    }
    const connErr = validateConnString(dbConnString);
    if (connErr) {
      toast.error(connErr);
      return;
    }
    setPaying(true);
    try {
      await api.patch(`/projects/${projectId}/supabase`, {
        supabase_url: url,
        supabase_anon_key: key,
        connection_string: dbConnString.trim() || undefined,
      });
      const res = await api.post<{ checkout_url?: string; paid?: boolean }>(
        `/migrations/${migrationId}/confirm`,
        {
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

  async function handleApplySchema() {
    setApplyingSchema(true);
    try {
      await api.post(`/migrations/${migrationId}/apply-schema`, {
        connection_string: dbConnString.trim() || undefined,
        save: rememberDbConn,
      });
      toast.success(
        "Tables created in your Supabase project! Next, import your existing data — see the note below.",
      );
      setSchemaApplied(true);
      setDbConnString("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setApplyingSchema(false);
    }
  }

  async function handlePushEnv() {
    if (!envText.trim()) {
      toast.error("Paste your .env contents or choose a file first.");
      return;
    }
    setPushingEnv(true);
    try {
      const res = await api.post<{ keys: string[]; count: number }>(
        `/migrations/${migrationId}/env`,
        { env: envText },
      );
      setPushedEnvKeys(res.keys);
      setEnvText("");
      toast.success(
        `Pushed ${res.count} variable${res.count === 1 ? "" : "s"} to Vercel.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setPushingEnv(false);
    }
  }

  async function handleDownloadReview() {
    setDownloadingReview(true);
    try {
      const res = await api.get<{ url: string; name: string }>(
        `/migrations/${migrationId}/review-download`,
      );
      window.open(res.url, "_blank");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingReview(false);
    }
  }

  async function handlePushReview() {
    setPushingReview(true);
    try {
      const res = await api.post<{ branch: string; branch_url: string }>(
        `/migrations/${migrationId}/push-review`,
      );
      setReviewBranchUrl(res.branch_url);
      toast.success(`Reviewed code pushed to the "${res.branch}" branch.`);
    } catch (err: unknown) {
      const data = (err as { data?: { needs_github_connect?: boolean } })?.data;
      if (data?.needs_github_connect) {
        toast.error("Connect your GitHub account first, then try again.");
      } else {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPushingReview(false);
    }
  }

  function handleEnvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEnvText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
    // Reset so selecting the same file again re-triggers onChange.
    e.target.value = "";
  }

  async function handleDeployRailway() {
    setDeployingRailway(true);
    setRailwayGithubHelp(null);
    try {
      const res = await api.post<{
        domain: string | null;
        api_url_wired: boolean;
      }>(`/migrations/${migrationId}/deploy-railway`);
      toast.success(
        res.domain
          ? "Backend deploying to Railway..."
          : "Backend service created on Railway...",
      );
      if (res.api_url_wired) {
        toast.success("Backend URL wired into your Vercel frontend.");
      }
      fetchMigration();
    } catch (err: unknown) {
      const e = err as {
        message?: string;
        data?: { needs_github_connect?: boolean; github_app_url?: string };
      };
      if (e.data?.needs_github_connect) {
        setRailwayGithubHelp(
          e.data.github_app_url ||
            "https://github.com/apps/railway/installations/new",
        );
      }
      toast.error(e.message || "Failed to deploy backend to Railway.");
    } finally {
      setDeployingRailway(false);
    }
  }

  async function handlePushRailwayEnv() {
    if (!railwayEnvText.trim()) {
      toast.error("Paste your backend .env contents or choose a file first.");
      return;
    }
    setPushingRailwayEnv(true);
    try {
      const res = await api.post<{ keys: string[]; count: number }>(
        `/migrations/${migrationId}/railway-env`,
        { env: railwayEnvText },
      );
      setPushedRailwayEnvKeys(res.keys);
      setRailwayEnvText("");
      toast.success(
        `Pushed ${res.count} variable${res.count === 1 ? "" : "s"} to Railway.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setPushingRailwayEnv(false);
    }
  }

  function handleRailwayEnvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRailwayEnvText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
    e.target.value = "";
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

  async function handleDeployDirect() {
    setDeployingDirect(true);
    setActionError(null);
    try {
      await api.post(`/migrations/${migrationId}/deploy-direct`);
      toast.success("Deploying to Vercel (no GitHub needed)...");
      setPollKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      fetchMigration();
    } finally {
      setDeployingDirect(false);
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

  // The migrated code (and generated schema) exist once every file has been
  // processed. This stays true through later deploy attempts (building/fixing/
  // failed), so deploy-related status changes don't hide post-migration tools
  // like "Apply Schema".
  const migrationFinished =
    migration.files_to_migrate > 0 &&
    migration.files_migrated >= migration.files_to_migrate;

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

      {/* Committed secrets warning */}
      {(migration.committed_secrets || []).length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Secret files detected in your repository
              </p>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                We found {migration.committed_secrets.length} file
                {migration.committed_secrets.length === 1 ? "" : "s"} that
                appear to contain credentials. These are{" "}
                <strong>excluded from AI analysis</strong> and will be{" "}
                <strong>stripped from the migrated repository</strong> (and
                added to <code>.gitignore</code>) so secrets aren&rsquo;t
                republished. Because they were committed to your source repo,
                you should consider these secrets exposed and{" "}
                <strong>rotate them</strong>.
              </p>
              <p className="text-muted-foreground mt-2 font-mono text-xs break-all">
                {migration.committed_secrets.join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Review-before-production notice */}
      {(isCompleted || isReviewed || deployed) && (
        <div className="mb-6 rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                Review AI-generated code before production use
              </p>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                This code was rewritten by an AI model and is not guaranteed to
                be correct or secure. Review the changes, run your test suite,
                and verify auth, data access, and environment variables before
                relying on it in production. For high-trust workloads, have a
                human review the diff.
              </p>
            </div>
          </div>
        </div>
      )}

      {(isCompleted || isReviewed || deployed) && (
        <div className="mb-6">
          <BreakEvenCalculator
            migrationCostCents={migration.estimated_cost_cents}
            platform={migration.detected_platform}
            monthlySpend={monthlySpend}
            setMonthlySpend={setMonthlySpend}
            claudeSpend={claudeSpend}
            setClaudeSpend={setClaudeSpend}
          />
        </div>
      )}

      {(isCompleted || isReviewed || migrationFinished) && (
        <Card className="mb-6">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {schemaApplied || migration.has_db_url
                    ? "Database Tables"
                    : "Create Tables in Supabase"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {schemaApplied
                    ? "Schema applied to your Supabase project. You can re-apply below if you change projects or connection."
                    : migration.has_db_url
                      ? "We applied your schema automatically using your saved connection string — re-apply below if needed."
                      : "Paste your Session Pooler connection string and we'll create the tables for you with one click."}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium">
                Session Pooler connection string
              </span>
              <Input
                type="password"
                autoComplete="off"
                placeholder="postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres"
                value={dbConnString}
                onChange={(e) => setDbConnString(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block leading-relaxed">
                {migration.has_db_url
                  ? "Leave blank to reuse your saved connection, or paste a new one to override it. "
                  : ""}
                {urlToRef(migration.supabase_url) ? (
                  <a
                    href={`https://supabase.com/dashboard/project/${urlToRef(migration.supabase_url)}?showConnect=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Open the Connect dialog
                  </a>
                ) : (
                  <span className="font-medium">Open Connect in Supabase</span>
                )}
                , choose <strong>Session pooler</strong>, copy the URI, and
                replace{" "}
                <code className="bg-muted px-1 rounded">[YOUR-PASSWORD]</code>{" "}
                with your database password. Use the pooler (not the direct{" "}
                <code className="bg-muted px-1 rounded">db.…</code> host) — it
                connects over IPv4 so our servers can reach it. We send it over
                TLS, use it once, and only store it if you check the box below.
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={rememberDbConn}
                onChange={(e) => setRememberDbConn(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Remember this connection (encrypted) for re-applies
            </label>

            <div className="flex items-center gap-3">
              <Button
                variant={
                  schemaApplied || migration.has_db_url ? "outline" : "default"
                }
                size="sm"
                onClick={handleApplySchema}
                disabled={applyingSchema}
              >
                {applyingSchema ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Database className="mr-2 h-3.5 w-3.5" />
                )}
                {applyingSchema
                  ? "Applying..."
                  : schemaApplied || migration.has_db_url
                    ? "Re-apply"
                    : "Apply Schema"}
              </Button>
              {schemaApplied && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Applied
                </span>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Best run against a fresh/empty Supabase project. If a table
                already exists, the run is rolled back and nothing is changed.
              </p>
            </div>

            {!schemaApplied && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p className="leading-relaxed">
                  <strong>
                    Your app won&apos;t work until these tables are created.
                  </strong>{" "}
                  Paste your Supabase connection string above and click{" "}
                  <strong>Apply Schema</strong> — we&apos;ll set everything up
                  automatically. This is a required step.
                </p>
              </div>
            )}
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                <strong>This creates empty tables — your existing rows
                aren&apos;t copied over.</strong>{" "}
                We rebuild your database structure (tables, columns, indexes,
                and security policies), but moving your actual data is a
                separate step you control. The easiest way is to export your
                old data to CSV and import it from the Supabase dashboard
                (Table Editor → your table → <em>Insert</em> →{" "}
                <em>Import data from CSV</em>). See{" "}
                <a
                  href="https://supabase.com/docs/guides/database/import-data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Supabase&apos;s import-data guide
                </a>{" "}
                for CSV, pgloader, and direct Postgres copy options.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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

            {migration.backend_type && (
              <div className="mb-4">
                <BackendBanner
                  type={migration.backend_type}
                  details={migration.backend_details}
                />
              </div>
            )}

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
                const addonCents = addonCodeReview ? 7500 : 0;
                const totalCents = migration.estimated_cost_cents + addonCents;
                const effectiveProjectId =
                  supabaseProjectId ?? urlToRef(migration.supabase_url);
                const effectiveUrl =
                  supabaseUrl ??
                  refToUrl(effectiveProjectId) ??
                  migration.supabase_url ??
                  "";
                const effectiveKey =
                  supabaseKey ?? migration.supabase_anon_key ?? "";
                const anonKeyUrl = effectiveProjectId
                  ? `https://supabase.com/dashboard/project/${effectiveProjectId}/settings/api-keys/legacy`
                  : "";
                const credsReady =
                  effectiveUrl.trim() !== "" && effectiveKey.trim() !== "";
                const connError = validateConnString(dbConnString);
                const connWarning = connError
                  ? null
                  : connStringWarning(dbConnString);
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
                          <p>$30.00 base fee (incl. database schema)</p>
                          <p>
                            $
                            {(
                              (migration.estimated_cost_cents - 3000) /
                              100
                            ).toFixed(2)}{" "}
                            token usage (~
                            {(
                              migration.estimated_input_tokens +
                              migration.estimated_output_tokens
                            ).toLocaleString()}{" "}
                            tokens)
                          </p>
                          {addonCodeReview && <p>$75.00 code review</p>}
                        </div>
                      </div>
                    </div>

                    <BreakEvenCalculator
                      migrationCostCents={totalCents}
                      platform={migration.detected_platform}
                      monthlySpend={monthlySpend}
                      setMonthlySpend={setMonthlySpend}
                      claudeSpend={claudeSpend}
                      setClaudeSpend={setClaudeSpend}
                    />

                    <div className="space-y-3 my-4 p-4 rounded-lg border border-border bg-muted/30">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Optional Add-ons
                      </p>
                      <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-white hover:bg-muted/50 transition-colors">
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

                    <div className="space-y-3 my-4 p-4 rounded-lg border border-border bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">
                          Connect your Supabase project
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Required to run the migration. In your{" "}
                          <a
                            href="https://supabase.com/dashboard/projects"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Supabase dashboard
                          </a>
                          , open your project and go to{" "}
                          <strong>
                            Project Settings &rarr; API Keys &rarr; Legacy anon,
                            service_role API keys
                          </strong>
                          . Copy the{" "}
                          <code className="bg-muted px-1 rounded">anon</code>{" "}
                          key — it&apos;s public and safe to embed. The URL is
                          on the{" "}
                          <strong>Project Settings &rarr; Data API</strong>{" "}
                          page.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="estimate-supabase-id">
                          Supabase Project ID
                        </Label>
                        <Input
                          className="bg-white"
                          id="estimate-supabase-id"
                          placeholder="abcdefghijklmnopqrst"
                          value={effectiveProjectId}
                          onChange={(e) => {
                            const ref = normalizeRef(e.target.value);
                            setSupabaseProjectId(ref);
                            setSupabaseUrl(refToUrl(ref));
                          }}
                        />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Found in your{" "}
                          <a
                            href="https://supabase.com/dashboard/projects"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Supabase dashboard
                          </a>{" "}
                          under <strong>Project Settings &rarr; General</strong>{" "}
                          (the &ldquo;Reference ID&rdquo;), or as the{" "}
                          <code className="bg-muted px-1 rounded">
                            &lt;id&gt;
                          </code>{" "}
                          in your project URL.
                          {effectiveProjectId && (
                            <>
                              {" "}
                              Your project URL:{" "}
                              <code className="bg-muted px-1 rounded">
                                {effectiveUrl}
                              </code>
                            </>
                          )}
                        </p>
                      </div>
                      {effectiveProjectId && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="estimate-supabase-key">
                              Anon Key
                            </Label>
                            <Input
                              className="bg-white"
                              id="estimate-supabase-key"
                              placeholder="eyJhbGciOiJIUzI1NiIs..."
                              value={effectiveKey}
                              onChange={(e) => setSupabaseKey(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              <a
                                href={anonKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                Open your API keys
                              </a>{" "}
                              and copy the{" "}
                              <code className="bg-muted px-1 rounded">
                                anon
                              </code>{" "}
                              /{" "}
                              <code className="bg-muted px-1 rounded">
                                public
                              </code>{" "}
                              key (under &ldquo;Legacy anon, service_role API
                              keys&rdquo;). It&apos;s public and safe to embed.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="estimate-supabase-conn">
                              Session Pooler connection string{" "}
                              <span className="font-normal text-muted-foreground">
                                (optional)
                              </span>
                            </Label>
                            <Input
                              id="estimate-supabase-conn"
                              type="password"
                              autoComplete="off"
                              placeholder="postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres"
                              value={dbConnString}
                              onChange={(e) => setDbConnString(e.target.value)}
                              className={`bg-white font-mono text-xs ${
                                connError
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : ""
                              }`}
                            />
                            {connError && (
                              <p className="flex items-start gap-1.5 text-xs text-destructive">
                                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                {connError}
                              </p>
                            )}
                            {connWarning && (
                              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                {connWarning}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Provide this and we&apos;ll{" "}
                              <strong>create your tables automatically</strong>{" "}
                              when the migration finishes.{" "}
                              {effectiveProjectId ? (
                                <a
                                  href={`https://supabase.com/dashboard/project/${effectiveProjectId}?showConnect=true`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Open the Connect dialog
                                </a>
                              ) : (
                                <>Enter your Project ID above first, then open
                                Connect in Supabase</>
                              )}
                              , choose <strong>Session pooler</strong>, copy the
                              URI, and replace{" "}
                              <code className="bg-muted px-1 rounded">
                                [YOUR-PASSWORD]
                              </code>{" "}
                              with your database password. Use the pooler (not
                              the direct{" "}
                              <code className="bg-muted px-1 rounded">db.…</code>{" "}
                              host) so our servers can reach it over IPv4. Stored
                              encrypted.
                            </p>
                            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <p className="leading-relaxed">
                                <strong>
                                  Your tables must be created for the app to
                                  work.
                                </strong>{" "}
                                Easiest is to add the connection string now and
                                we&apos;ll set everything up for you. If you
                                skip it, you can add it on the next screen after
                                the migration and we&apos;ll create the tables
                                with one click &mdash; but the app won&apos;t
                                run until that&apos;s done. Note: this builds
                                your table structure, not your existing rows
                                &mdash; we&apos;ll show you how to import your
                                data afterward.
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="lg"
                        onClick={handlePayAndStart}
                        disabled={paying || !credsReady || !!connError}
                      >
                        {paying ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="mr-2 h-4 w-4" />
                        )}
                        {paying
                          ? "Redirecting..."
                          : connError
                            ? "Fix your connection string to continue"
                            : credsReady
                              ? `Pay $${(totalCents / 100).toFixed(2)} & Start`
                              : "Enter Supabase details to continue"}
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
                      <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                        Your source code is sent to Anthropic (Claude) for
                        analysis and migration. By proceeding with payment you
                        agree to our{" "}
                        <Link
                          to="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                          to="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Privacy Policy
                        </Link>
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
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Code Review Complete</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your migrated code has been reviewed by a senior engineer and
                  is ready for use.
                  {migration.reviewed_at &&
                    ` Reviewed ${new Date(migration.reviewed_at).toLocaleDateString()}.`}
                </p>

                {migration.review_notes && (
                  <div className="mt-3 rounded-md border bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Reviewer notes
                    </p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {migration.review_notes}
                    </p>
                  </div>
                )}

                {migration.has_review_artifact && (
                  <div className="mt-3">
                    <p className="text-[11px] text-muted-foreground mb-2">
                      The reviewer's updated version of your code — download it
                      or push it to a{" "}
                      <span className="font-mono">yougrate/reviewed</span>{" "}
                      branch on your GitHub repo to diff and merge.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadingReview}
                        onClick={handleDownloadReview}
                      >
                        {downloadingReview ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="mr-1.5 h-3 w-3" />
                        )}
                        Download (.zip)
                      </Button>
                      <Button
                        size="sm"
                        disabled={pushingReview}
                        onClick={handlePushReview}
                      >
                        {pushingReview ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <GitBranch className="mr-1.5 h-3 w-3" />
                        )}
                        Push to GitHub
                      </Button>
                    </div>
                    {reviewBranchUrl && (
                      <a
                        href={reviewBranchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View the yougrate/reviewed branch
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request code review */}
      {(isCompleted || isFailed) && !migration.addon_code_review && (
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Request Code Review</p>
                <p className="text-xs text-muted-foreground">
                  Have a senior engineer review your migrated code — $75
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await api.post<{
                    checkout_url?: string;
                    status?: string;
                  }>(`/migrations/${migrationId}/request-review`);
                  if (res.checkout_url) {
                    window.location.href = res.checkout_url;
                    return;
                  }
                  toast.success("Code review requested!");
                  setPollKey((k) => k + 1);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  toast.error(msg);
                }
              }}
            >
              <UserCheck className="mr-2 h-3.5 w-3.5" />
              Request Review — $75
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Push migrated code */}
      {(isCompleted || isReviewed || deployed) && !isBuilding && !isFixing && (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Deploy to Vercel
            </CardTitle>
            <CardDescription>
              One click &mdash; no GitHub account required. We upload your
              migrated app straight to Vercel using your connected Vercel token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!deployed ? (
              <Button onClick={handleDeployDirect} disabled={deployingDirect}>
                {deployingDirect ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="mr-2 h-4 w-4" />
                )}
                {deployingDirect ? "Deploying..." : "Deploy to Vercel"}
              </Button>
            ) : (
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
                  onClick={handleDeployDirect}
                  disabled={deployingDirect}
                >
                  {deployingDirect ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Rocket className="mr-2 h-3 w-3" />
                  )}
                  {deployingDirect ? "Redeploying..." : "Redeploy"}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Want Vercel to rebuild automatically every time you push code?
              Push to GitHub below and connect Vercel to GitHub in Settings
              (optional, for GitHub users).
            </p>
          </CardContent>
        </Card>
      )}

      {(isCompleted || isReviewed) && !migration.output_repo_url && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Push to GitHub (optional)</CardTitle>
            <CardDescription>
              For GitHub users &mdash; push the migrated code to a repo so
              Vercel can auto-deploy on every push. Not required if you used the
              one-click deploy above.
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
              disabled={pushing || (pushType === "new" && !repoName.trim())}
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
              <Button
                variant="outline"
                onClick={handleDeploy}
                disabled={deploying}
              >
                <Rocket className="mr-2 h-4 w-4" />
                {deploying ? "Deploying..." : "Deploy from GitHub repo"}
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

      {/* Environment variable transfer */}
      {deployed &&
        (() => {
          const previewKeys = previewEnvKeys(envText);
          return (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                  Environment Variables
                </CardTitle>
                <CardDescription>
                  Paste your <code className="text-xs">.env</code> (or choose a
                  file) to push every variable to Vercel at once. Values are
                  sent straight to Vercel and are never stored by Yougrate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  placeholder={
                    "API_KEY=sk-...\nDATABASE_URL=postgres://...\nNEXT_PUBLIC_FOO=bar"
                  }
                  spellCheck={false}
                  className="w-full min-h-[140px] rounded-md border border-input bg-white px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      onChange={handleEnvFile}
                      className="hidden"
                    />
                    <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-accent">
                      <Upload className="h-3.5 w-3.5" />
                      Choose .env file
                    </span>
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Tip: <code>.env</code> files are hidden &mdash; on macOS
                    press
                    <kbd className="px-1">⌘</kbd>+
                    <kbd className="px-1">shift</kbd>+
                    <kbd className="px-1">.</kbd> in the picker, or just paste
                    above.
                  </span>
                  <Button
                    size="sm"
                    onClick={handlePushEnv}
                    disabled={pushingEnv || previewKeys.length === 0}
                  >
                    {pushingEnv ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="mr-2 h-4 w-4" />
                    )}
                    {pushingEnv
                      ? "Pushing..."
                      : previewKeys.length > 0
                        ? `Push ${previewKeys.length} variable${previewKeys.length === 1 ? "" : "s"} to Vercel`
                        : "Push to Vercel"}
                  </Button>
                </div>

                {previewKeys.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Detected keys:</span>{" "}
                    <span className="font-mono">{previewKeys.join(", ")}</span>
                  </div>
                )}

                {pushedEnvKeys && pushedEnvKeys.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 p-2.5 text-xs text-green-800">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                      Pushed to Vercel:{" "}
                      <span className="font-mono">
                        {pushedEnvKeys.join(", ")}
                      </span>
                      . Redeploy for the new values to take effect.
                    </p>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Stored on Vercel as &ldquo;sensitive&rdquo; variables (they
                  can&apos;t be read back out). Existing keys with the same name
                  are overwritten.
                </p>
              </CardContent>
            </Card>
          );
        })()}

      {/* Backend server -> Railway */}
      {migration.backend_type === "server" && migration.output_repo_url && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              Backend Server (Railway)
            </CardTitle>
            <CardDescription>
              This app needs a long-running server, which Vercel can&apos;t
              host. Deploy it to Railway
              {migration.backend_details?.server_dir &&
              migration.backend_details.server_dir !== "."
                ? ` from ${migration.backend_details.server_dir}/`
                : ""}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!profile?.railway_connected ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="leading-relaxed">
                  Connect your Railway account in{" "}
                  <Link to="/settings" className="underline font-medium">
                    Settings
                  </Link>{" "}
                  to deploy the backend. You&apos;ll also need to authorize
                  Railway&apos;s GitHub app on this repo.
                </p>
              </div>
            ) : !migration.railway_service_id ? (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We&apos;ll create a Railway project, connect this repo
                  {migration.backend_details?.start_command ? (
                    <>
                      , set the start command (
                      <code className="font-mono">
                        {migration.backend_details.start_command}
                      </code>
                      )
                    </>
                  ) : null}
                  , generate a public URL, and wire it into your Vercel
                  frontend.
                </p>
                {railwayGithubHelp && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                      Railway can&apos;t access this repo yet. Authorize the{" "}
                      <a
                        href={railwayGithubHelp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium inline-flex items-center gap-1"
                      >
                        Railway GitHub app
                        <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      on this repository, then retry.
                    </p>
                  </div>
                )}
                <Button
                  onClick={handleDeployRailway}
                  disabled={deployingRailway}
                >
                  {deployingRailway ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="mr-2 h-4 w-4" />
                  )}
                  {deployingRailway
                    ? "Deploying..."
                    : "Deploy backend to Railway"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">
                    Backend deployed to Railway
                  </span>
                </div>
                {migration.railway_service_domain && (
                  <div>
                    <p className="text-xs text-muted-foreground">Backend URL</p>
                    <a
                      href={`https://${migration.railway_service_domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline font-mono"
                    >
                      https://{migration.railway_service_domain}
                    </a>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeployRailway}
                  disabled={deployingRailway}
                >
                  {deployingRailway ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Server className="mr-2 h-3 w-3" />
                  )}
                  {deployingRailway ? "Redeploying..." : "Redeploy"}
                </Button>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Backend environment variables
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Paste your server&apos;s{" "}
                    <code className="text-xs">.env</code> to push it to the
                    Railway service. Values go straight to Railway and are never
                    stored by Yougrate.
                  </p>
                  <textarea
                    value={railwayEnvText}
                    onChange={(e) => setRailwayEnvText(e.target.value)}
                    placeholder={"DATABASE_URL=postgres://...\nJWT_SECRET=..."}
                    spellCheck={false}
                    className="w-full min-h-[120px] rounded-md border border-input bg-white px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex">
                      <input
                        type="file"
                        onChange={handleRailwayEnvFile}
                        className="hidden"
                      />
                      <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-accent">
                        <Upload className="h-3.5 w-3.5" />
                        Choose .env file
                      </span>
                    </label>
                    <Button
                      size="sm"
                      onClick={handlePushRailwayEnv}
                      disabled={pushingRailwayEnv || !railwayEnvText.trim()}
                    >
                      {pushingRailwayEnv ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="mr-2 h-4 w-4" />
                      )}
                      {pushingRailwayEnv ? "Pushing..." : "Push to Railway"}
                    </Button>
                  </div>
                  {pushedRailwayEnvKeys && pushedRailwayEnvKeys.length > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 p-2.5 text-xs text-green-800">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <p className="leading-relaxed">
                        Pushed to Railway:{" "}
                        <span className="font-mono">
                          {pushedRailwayEnvKeys.join(", ")}
                        </span>
                        . Railway will redeploy with the new values.
                      </p>
                    </div>
                  )}
                </div>
              </>
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
                          : "bg-white border-border hover:bg-muted/30"
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
                    <div className="flex items-center gap-3 mr-1">
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
