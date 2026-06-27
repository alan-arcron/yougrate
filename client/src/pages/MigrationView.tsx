import { useEffect, useRef, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
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
  Server,
  Zap,
  Upload,
  Download,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  SupabaseConnectFields,
  refToUrl,
  urlToRef,
  validateConnString,
} from "@/components/SupabaseConnectFields";

interface MigrationFile {
  id: string;
  file_path: string;
  status: string;
  changes_summary: { reason?: string } | null;
  input_tokens: number;
  output_tokens: number;
}

interface VerificationCheck {
  area: string;
  what_changed: string;
  how_to_test: string;
  severity: "high" | "normal";
}

interface VerificationReport {
  summary: string;
  checks: VerificationCheck[];
  edge_functions?: { name: string; description: string }[];
  generated_at: string;
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
  schema_applied: boolean;
  schema_error: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  has_review_artifact: boolean;
  verification_report: VerificationReport | null;
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
              Your app has small pieces of backend code (&ldquo;edge
              functions&rdquo;).
            </span>{" "}
            These are little programs that run on demand &mdash; things like
            sending an email, charging a card, or calling another service
            &mdash; rather than living in the part of the app people click on.
            {fns.length > 0 ? (
              <>
                {" "}
                We found <span className="font-medium">{fns.length}</span> of
                them: <span className="font-mono">{fns.join(", ")}</span>.
              </>
            ) : null}{" "}
            They get hosted by Supabase (not Vercel), so after migrating
            you&apos;ll deploy them to your Supabase project. The report below
            explains what each one does and what to test.
          </p>
          <a
            href="https://supabase.com/docs/guides/functions/deploy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-amber-900 underline"
          >
            How to deploy these (step-by-step)
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
 * Step-by-step Railway setup, shown when an app needs a long-running backend
 * but the user hasn't connected Railway yet. Mirrors the flow on the Settings
 * page so non-technical users know exactly what to do.
 */
function RailwaySetupSteps() {
  return (
    <ol className="mt-2 space-y-2 text-xs text-amber-900 dark:text-amber-200">
      <li className="flex gap-2">
        <span className="font-semibold shrink-0">1.</span>
        <span className="leading-relaxed">
          Open{" "}
          <Link to="/settings" className="underline font-medium">
            Settings &rarr; Railway
          </Link>{" "}
          in a new tab.
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-semibold shrink-0">2.</span>
        <span className="leading-relaxed">
          Create a Railway account (free) and generate an API token at{" "}
          <a
            href="https://railway.com/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium inline-flex items-center gap-1"
          >
            railway.com/account/tokens
            <ExternalLink className="h-3 w-3" />
          </a>
          . Leave the workspace dropdown on{" "}
          <strong>&ldquo;No workspace&rdquo;</strong> &mdash; a workspace- or
          project-scoped token won&apos;t work.
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-semibold shrink-0">3.</span>
        <span className="leading-relaxed">
          Paste that token into the Railway box in Settings and click{" "}
          <strong>Save Token</strong>.
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-semibold shrink-0">4.</span>
        <span className="leading-relaxed">
          Authorize the{" "}
          <a
            href="https://github.com/apps/railway-app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium inline-flex items-center gap-1"
          >
            Railway GitHub app
            <ExternalLink className="h-3 w-3" />
          </a>{" "}
          on the repo we migrate, so Railway can build it.
        </span>
      </li>
    </ol>
  );
}

/**
 * Render the verification report into a clean, multi-page PDF the user can keep
 * while testing. Text-only (no canvas) so it stays crisp and tiny.
 */
function downloadReportPdf(
  report: VerificationReport,
  meta: { platform: string | null; migrationId: string },
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeLines = (
    text: string,
    opts: {
      size: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
    },
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size);
    doc.setTextColor(...(opts.color ?? [30, 30, 30]));
    const lines = doc.splitTextToSize(text, maxW);
    const lineH = opts.size * 1.35;
    for (const line of lines) {
      ensureSpace(lineH);
      doc.text(line, margin, y);
      y += lineH;
    }
    y += opts.gap ?? 0;
  };

  // Header
  writeLines("What changed & what to test", { size: 20, bold: true, gap: 4 });
  writeLines(
    `${meta.platform ? `${meta.platform} \u2192 Supabase migration` : "Migration"}  \u2022  ${new Date(
      report.generated_at,
    ).toLocaleDateString()}  \u2022  ${meta.migrationId.slice(0, 8)}`,
    { size: 9, color: [120, 120, 120], gap: 14 },
  );

  if (report.summary) {
    writeLines(report.summary, { size: 11, color: [60, 60, 60], gap: 18 });
  }

  const edgeFns = report.edge_functions ?? [];
  if (edgeFns.length > 0) {
    writeLines("Backend functions in your app", {
      size: 13,
      bold: true,
      gap: 2,
    });
    writeLines(
      "Small pieces of backend code that run on demand. They live on Supabase and must be deployed there separately to keep working.",
      { size: 9.5, color: [120, 120, 120], gap: 8 },
    );
    for (const fn of edgeFns) {
      writeLines(
        `\u2022 ${fn.name}${fn.description ? ` \u2014 ${fn.description}` : ""}`,
        { size: 10.5, color: [60, 60, 60], gap: 4 },
      );
    }
    y += 12;
  }

  const items = report.checks ?? [];
  const ordered = [...items].sort(
    (a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1),
  );
  if (ordered.length > 0) {
    writeLines("Test these in your app", { size: 13, bold: true, gap: 8 });
    ordered.forEach((c, i) => {
      ensureSpace(40);
      const prefix = c.severity === "high" ? "[TEST FIRST] " : "";
      writeLines(`${i + 1}. ${prefix}${c.area}`, {
        size: 11.5,
        bold: true,
        color: c.severity === "high" ? [180, 83, 9] : [30, 30, 30],
        gap: 2,
      });
      if (c.what_changed) {
        writeLines(c.what_changed, { size: 10, color: [90, 90, 90], gap: 2 });
      }
      if (c.how_to_test) {
        writeLines(`How to check: ${c.how_to_test}`, {
          size: 10,
          color: [60, 60, 60],
          gap: 12,
        });
      }
    });
  }

  const fname =
    `yougrate-report-${meta.platform || "migration"}-${meta.migrationId.slice(0, 8)}.pdf`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-");
  doc.save(fname);
}

/**
 * The headline post-migration deliverable: a plain-language report of what
 * changed and exactly what the (often non-technical) user should click through
 * and test. High-severity areas (accounts, login, payments, backend functions)
 * are pinned to the top and visually emphasized.
 */
function VerificationReportCard({
  report,
  checks,
  onToggle,
  platform,
  migrationId,
  highlight = false,
}: {
  report: VerificationReport;
  checks: Record<string, boolean>;
  onToggle: (id: string, value: boolean) => void;
  platform: string | null;
  migrationId: string;
  highlight?: boolean;
}) {
  const items = (report.checks ?? []).map((c, i) => ({
    ...c,
    id: `vr_${i}`,
  }));
  const ordered = [...items].sort(
    (a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1),
  );
  const done = ordered.filter((c) => checks[c.id]).length;
  const edgeFns = report.edge_functions ?? [];

  return (
    <Card
      className={`mb-6 ${
        highlight
          ? "border-2 border-green-500/60 shadow-sm"
          : "border-primary/30"
      }`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle
              className={`text-lg flex items-center gap-2 ${
                highlight ? "text-green-700 dark:text-green-400" : ""
              }`}
            >
              {highlight ? (
                <Rocket className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
              What changed &amp; what to test
              {highlight && (
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 border border-green-500/50 rounded px-1.5 py-0.5">
                  Final step
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1.5">
              A plain-English rundown of what we changed in your app and exactly
              what to click through to make sure nothing broke.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => downloadReportPdf(report, { platform, migrationId })}
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[480px] overflow-y-auto">
        {highlight && (
          <div className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              <strong>
                You&apos;re all set — that&apos;s everything on our end!
              </strong>{" "}
              Your app is deployed and your environment variables are in place.
              The last thing to do is open your app and click through the checks
              below to make sure everything works.
            </p>
          </div>
        )}
        {report.summary && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {report.summary}
          </p>
        )}

        {edgeFns.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Backend functions in your app
            </p>
            <p className="text-[11px] text-amber-800 dark:text-amber-300/80 mt-1 leading-relaxed">
              These are small pieces of backend code that run on demand. They
              live on Supabase and need to be deployed there separately to keep
              working.
            </p>
            <ul className="mt-2 space-y-1.5">
              {edgeFns.map((fn) => (
                <li key={fn.name} className="text-xs">
                  <span className="font-mono font-medium text-amber-900 dark:text-amber-200">
                    {fn.name}
                  </span>
                  {fn.description ? (
                    <span className="text-amber-800 dark:text-amber-300/80">
                      {" "}
                      &mdash; {fn.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ordered.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {done}/{ordered.length} checked
            </p>
            <div className="space-y-1.5">
              {ordered.map((c) => {
                const isHigh = c.severity === "high";
                const isChecked = !!checks[c.id];
                return (
                  <label
                    key={c.id}
                    className={`flex items-start gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
                      isChecked
                        ? "bg-muted/30 border-border/50"
                        : isHigh
                          ? "bg-amber-50/60 border-amber-300 hover:bg-amber-50 dark:bg-amber-950/10 dark:border-amber-900"
                          : "bg-white border-border hover:bg-muted/30 dark:bg-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => onToggle(c.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : ""}`}
                        >
                          {c.area}
                        </p>
                        {isHigh && !isChecked && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-600 text-[10px] px-1.5 py-0"
                          >
                            Test first
                          </Badge>
                        )}
                      </div>
                      {c.what_changed && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {c.what_changed}
                        </p>
                      )}
                      {c.how_to_test && (
                        <p className="text-xs mt-1 leading-relaxed">
                          <span className="font-medium">How to check: </span>
                          <span className="text-muted-foreground">
                            {c.how_to_test}
                          </span>
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  // Tracks the last-seen status so polling can fire success/failure toasts on
  // transitions (migration run finishing, deploy finishing/failing).
  const prevStatusRef = useRef<string | null>(null);

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

          // Fire toasts on status transitions. We track the previous status in a
          // ref so this works reliably across polls and poll restarts.
          const prev = prevStatusRef.current;
          if (prev && prev !== data.status) {
            if (prev === "running" && data.status === "completed") {
              toast.success("Migration completed successfully!");
            } else if (
              (prev === "building" || prev === "fixing") &&
              data.status === "completed" &&
              data.is_deployed
            ) {
              toast.success("Deployed to Vercel successfully!");
            } else if (
              (prev === "building" || prev === "fixing") &&
              data.status === "failed"
            ) {
              toast.error(
                "Deployment failed — check the log below for details.",
              );
            } else if (
              (prev === "running" || prev === "analyzing") &&
              data.status === "failed"
            ) {
              toast.error(
                "Migration failed — check the log below for details.",
              );
            }
          }
          prevStatusRef.current = data.status;
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

  async function handleApplySchema() {
    setApplyingSchema(true);
    try {
      // Persist any corrected Supabase URL / anon key (non-sensitive) so the fix
      // sticks for deploys and future re-applies. The DB connection string is
      // only stored if the user opts in (handled by apply-schema's `save`).
      const ref = supabaseProjectId ?? urlToRef(migration?.supabase_url ?? "");
      const key = supabaseKey ?? migration?.supabase_anon_key ?? "";
      const supabasePatch: Record<string, string> = {};
      if (ref) supabasePatch.supabase_url = refToUrl(ref);
      if (key) supabasePatch.supabase_anon_key = key;
      if (Object.keys(supabasePatch).length > 0) {
        await api.patch(`/projects/${projectId}/supabase`, supabasePatch);
      }

      await api.post(`/migrations/${migrationId}/apply-schema`, {
        connection_string: dbConnString.trim() || undefined,
        save: rememberDbConn,
      });
      toast.success(
        "Tables created in your Supabase project! Next, import your existing data — see the note below.",
      );
      setSchemaApplied(true);
      setDbConnString("");
      fetchMigration();
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
        `Pushed ${res.count} variable${res.count === 1 ? "" : "s"} to Vercel. Click "Deploy to Vercel" below when you're ready.`,
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

  // Deploy from the already-pushed GitHub repo. Used for the initial deploy,
  // retries after a failure (no re-push needed), and env-triggered redeploys.
  async function handleDeploy() {
    setDeploying(true);
    setActionError(null);
    try {
      await api.post(`/migrations/${migrationId}/deploy`);
      toast.success("Deploying to Vercel — check the log below for details.");
      setPollKey((k) => k + 1);
      fetchMigration();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      toast.error(msg);
      fetchMigration();
    } finally {
      setDeploying(false);
    }
  }

  // Step 1: push the migrated code to GitHub AND create the linked Vercel
  // project (seeded with Supabase env vars) — WITHOUT deploying. Deploying is a
  // separate, explicit step once env vars are in place, so we only ever build
  // once instead of building here and redeploying after env vars are added.
  async function handleSetup() {
    setPushing(true);
    setActionError(null);
    try {
      await api.post(`/migrations/${migrationId}/push`, {
        output_type: pushType,
        repo_name: repoName.trim() || undefined,
      });
      toast.success(
        "Pushed to GitHub and set up Vercel. Add your environment variables, then deploy.",
      );
      fetchMigration();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      toast.error(msg);
      fetchMigration();
    } finally {
      setPushing(false);
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

  // Guided post-migration flow: Set up (push + Vercel project, no build) ->
  // Env vars & Deploy. Whichever step is "next in line" gets the green/rocket
  // highlight so users always know what to do next.
  const migrationDone = isCompleted || isReviewed || deployed;
  const isSetUp = !!migration.output_repo_url;
  const setupStepActive = migrationDone && !isSetUp && !isBuilding && !isFixing;
  const deployStepActive =
    migrationDone && isSetUp && !deployed && !isBuilding && !isFixing;
  // A deploy failed (we have a pushed repo) vs the migration run itself failing
  // (no repo yet). Deploy failures are shown inline so the deploy/env cards stay.
  const deployFailed = isFailed && !!migration.output_repo_url;

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

      {(isCompleted || isReviewed || deployed) &&
        migration.verification_report && (
          <VerificationReportCard
            report={migration.verification_report}
            checks={postDeployChecks}
            onToggle={(id, value) =>
              setPostDeployChecks((prev) => ({ ...prev, [id]: value }))
            }
            platform={migration.detected_platform}
            migrationId={migration.id}
            highlight={deployed}
          />
        )}

      {/* {(isCompleted || isReviewed || deployed) && (
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
      )} */}

      {(isCompleted || isReviewed || migrationFinished) &&
        !(migration.schema_applied || schemaApplied) && (
          <Card
            className={`mb-6 ${
              migration.schema_error ? "border-2 border-destructive/50" : ""
            }`}
          >
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Create Tables in Supabase
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {migration.schema_error
                      ? "We couldn't create your tables automatically. Double-check your Supabase details below — fix anything that's off — and try again."
                      : migration.has_db_url
                        ? "We tried to create your tables automatically but they aren't ready yet. Confirm your Supabase details below and re-apply."
                        : "Confirm your Supabase project details below and we'll create the tables for you with one click."}
                  </p>
                </div>
              </div>

              {migration.schema_error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p className="leading-relaxed">
                    <strong>Automatic table creation failed.</strong>{" "}
                    {migration.schema_error}
                  </p>
                </div>
              )}

              <SupabaseConnectFields
                idPrefix="apply"
                projectId={
                  supabaseProjectId ?? urlToRef(migration.supabase_url)
                }
                onProjectIdChange={(ref) => {
                  setSupabaseProjectId(ref);
                  setSupabaseUrl(refToUrl(ref));
                }}
                anonKey={supabaseKey ?? migration.supabase_anon_key ?? ""}
                onAnonKeyChange={setSupabaseKey}
                connString={dbConnString}
                onConnStringChange={setDbConnString}
                connNote={
                  migration.has_db_url
                    ? "Leave the connection string blank to reuse your saved one, or paste a new one to override it."
                    : undefined
                }
              />

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
                    schemaApplied || migration.has_db_url
                      ? "outline"
                      : "default"
                  }
                  size="sm"
                  onClick={handleApplySchema}
                  disabled={
                    applyingSchema || !!validateConnString(dbConnString)
                  }
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
                  <strong>
                    Your app won&apos;t work until these tables are created.
                  </strong>{" "}
                  Best run against a fresh/empty Supabase project. If a table
                  already exists, the run is rolled back and nothing is changed.
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p className="leading-relaxed">
                  <strong>
                    This creates empty tables — your existing rows aren&apos;t
                    copied over.
                  </strong>{" "}
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

      {(isCompleted || isReviewed || migrationFinished) &&
        (migration.schema_applied || schemaApplied) && (
          <Card className="mb-6 border-green-500/40">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Database tables created</p>
                  <p className="text-xs text-muted-foreground">
                    We applied your schema to your Supabase project. Need to
                    point at a different project? Update the connection from
                    your project settings.
                  </p>
                </div>
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

            {migration.backend_type === "server" &&
              !profile?.railway_connected &&
              !migration.output_repo_url && (
                <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                    <Server className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="leading-relaxed font-medium">
                      Heads up: this app needs a separate backend host
                      (Railway). Set it up now so it&apos;s ready the moment
                      your migration finishes &mdash; it only takes a minute:
                    </p>
                  </div>
                  <RailwaySetupSteps />
                </div>
              )}

            {/* {migration.analysis_input_tokens +
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
              )} */}
          </CardContent>
        </Card>
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
          const effectiveKey = supabaseKey ?? migration.supabase_anon_key ?? "";
          const credsReady =
            effectiveUrl.trim() !== "" &&
            effectiveKey.trim() !== "" &&
            dbConnString.trim() !== "";
          const connError = validateConnString(dbConnString);
          return (
            <Card className="mb-6 border-2 border-green-500/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Rocket className="h-5 w-5" />
                  Next step: start your migration
                </CardTitle>
                <CardDescription>
                  Review your estimate, connect your Supabase project, then pay
                  to begin.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                {/* 
                <BreakEvenCalculator
                  migrationCostCents={totalCents}
                  platform={migration.detected_platform}
                  monthlySpend={monthlySpend}
                  setMonthlySpend={setMonthlySpend}
                  claudeSpend={claudeSpend}
                  setClaudeSpend={setClaudeSpend}
                /> */}

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
                        A senior engineer from our team manually reviews your
                        migrated codebase before delivery. The review covers:
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
                          Performance &mdash; unnecessary re-renders, missing
                          indexes, N+1 queries
                        </li>
                        <li>
                          Bug detection &mdash; broken imports, dead code paths,
                          type mismatches
                        </li>
                        <li>
                          Scalability &mdash; connection pooling, caching
                          opportunities, rate-limit readiness
                        </li>
                        <li>
                          Migration completeness &mdash; no leftover platform
                          references or orphaned config
                        </li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Your migration will be held in a &ldquo;pending
                        review&rdquo; state until the review is complete. Use
                        code <strong>ARCRON</strong> at checkout for a free
                        review.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="space-y-3 my-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      Connect your Supabase project
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 border border-green-500/50 rounded px-1.5 py-0.5">
                        Required
                      </span>
                    </p>
                  </div>
                  <SupabaseConnectFields
                    idPrefix="estimate"
                    inputClassName="bg-white"
                    projectId={effectiveProjectId}
                    onProjectIdChange={(ref) => {
                      setSupabaseProjectId(ref);
                      setSupabaseUrl(refToUrl(ref));
                    }}
                    anonKey={effectiveKey}
                    onAnonKeyChange={setSupabaseKey}
                    connString={dbConnString}
                    onConnStringChange={setDbConnString}
                  />
                </div>

                <div className="my-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                  <FileCode className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <p className="leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">
                      You&apos;ll get a plain-English report when the migration
                      finishes.
                    </span>{" "}
                    We generate a &ldquo;What changed &amp; what to test&rdquo;
                    report that walks you, in non-technical language, through
                    everything we changed and exactly what to click through in
                    your app to make sure it still works.
                  </p>
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
                    AI-driven fix cycles — the output is not guaranteed to be
                    error-free or production-ready. You may need to review and
                    adjust the migrated code yourself. Yougrate is not
                    responsible for bugs, data loss, or downtime resulting from
                    migrated code. Your original repository is never modified.
                    By proceeding with payment, you acknowledge these
                    limitations and agree that all sales are final. Need help
                    with your migrated code?{" "}
                    <a
                      href="https://arcron.systems"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Arcron Information Systems
                    </a>{" "}
                    offers professional software services that can assist with
                    any issues — reach out at{" "}
                    <a
                      href="mailto:yougrate@arcron.systems"
                      className="text-primary hover:underline"
                    >
                      yougrate@arcron.systems
                    </a>
                    .
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Your source code is sent to Anthropic (Claude) for analysis
                    and migration. By proceeding with payment you agree to our{" "}
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
              </CardContent>
            </Card>
          );
        })()}

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
            <CardTitle className="text-lg flex items-center gap-2">
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
              )}
              Migration Progress
              {isCompleted && (
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 border border-green-500/50 rounded px-1.5 py-0.5">
                  Complete
                </span>
              )}
            </CardTitle>
            {isRunning && migration.current_file && (
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

      {/* Step 1: push to GitHub + create the linked Vercel project (no deploy) */}
      {(isCompleted || isReviewed) &&
        !migration.output_repo_url &&
        !isBuilding &&
        !isFixing && (
          <Card
            className={`mb-6 ${
              setupStepActive
                ? "border-2 border-green-500/60 shadow-sm"
                : "border-primary/30"
            }`}
          >
            <CardHeader>
              <CardTitle
                className={`text-lg flex items-center gap-2 ${
                  setupStepActive ? "text-green-700 dark:text-green-400" : ""
                }`}
              >
                <GitFork className="h-5 w-5" />
                Push to GitHub &amp; set up Vercel
                {setupStepActive && (
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 border border-green-500/50 rounded px-1.5 py-0.5">
                    Next step
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Push the migrated code to your Github account and create a new
                Vercel project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {migration.schema_error &&
                !(migration.schema_applied || schemaApplied) && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                      <strong>Create your database tables first.</strong> We
                      couldn&apos;t set them up automatically, so your app will
                      deploy but won&apos;t work until the tables exist. Resolve
                      the <strong>Create Tables in Supabase</strong> step above
                      first.
                    </p>
                  </div>
                )}
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
                    A new private repo will be created under your GitHub
                    account.
                  </p>
                </div>
              )}

              <Button
                onClick={handleSetup}
                disabled={pushing || (pushType === "new" && !repoName.trim())}
              >
                {pushing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GitFork className="mr-2 h-4 w-4" />
                )}
                {pushing ? "Setting up..." : "Push to GitHub & set up Vercel"}
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Step 2: environment variables + a single explicit deploy */}
      {migration.output_repo_url &&
        (() => {
          const previewKeys = previewEnvKeys(envText);
          return (
            <Card
              className={`mb-6 ${
                deployStepActive
                  ? "border-2 border-green-500/60 shadow-sm"
                  : deployFailed
                    ? "border-2 border-destructive/50"
                    : ""
              }`}
            >
              <CardHeader>
                <CardTitle
                  className={`text-lg flex items-center gap-2 ${
                    deployStepActive ? "text-green-700 dark:text-green-400" : ""
                  }`}
                >
                  {deployed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Rocket className="h-5 w-5" />
                  )}
                  {deployed
                    ? "Deployed to Vercel"
                    : "Add environment variables & deploy"}
                  {deployStepActive && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 border border-green-500/50 rounded px-1.5 py-0.5">
                      Next step
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  Add your environment variables, then deploy. Supabase is
                  already set.
                </CardDescription>
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
                    <p className="text-sm font-mono">
                      {migration.output_branch}
                    </p>
                  </div>
                )}

                {migration.schema_error &&
                  !(migration.schema_applied || schemaApplied) && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <p className="leading-relaxed">
                        <strong>Create your database tables first.</strong> Your
                        app will deploy but won&apos;t work until the tables
                        exist &mdash; resolve the{" "}
                        <strong>Create Tables in Supabase</strong> step above.
                      </p>
                    </div>
                  )}

                {/* Environment variables */}
                <div className="space-y-3 rounded-md border border-border/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Environment variables
                  </p>
                  <textarea
                    value={envText}
                    onChange={(e) => setEnvText(e.target.value)}
                    placeholder={
                      "API_KEY=sk-...\nDATABASE_URL=postgres://...\nVITE_FOO=bar"
                    }
                    spellCheck={false}
                    className="w-full min-h-[120px] rounded-md border border-input bg-white px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                      variant="outline"
                      onClick={handlePushEnv}
                      disabled={pushingEnv || previewKeys.length === 0}
                    >
                      {pushingEnv ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
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
                      <span className="font-mono">
                        {previewKeys.join(", ")}
                      </span>
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
                        . {deployed ? "Redeploy" : "Deploy"} below to apply
                        them.
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sent straight to Vercel, never stored by Yougrate.
                  </p>
                </div>

                {/* Deploy */}
                {deployFailed && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="leading-relaxed">
                      <p>
                        <strong>Deployment failed.</strong>{" "}
                        {migration.error_message}
                      </p>
                      <p className="mt-0.5">
                        Check the log below for details. Fix your env vars if
                        needed and retry &mdash; no need to push your code
                        again.
                      </p>
                    </div>
                  </div>
                )}

                {(isBuilding || isFixing) && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deploying&hellip; check the log below for details.
                  </p>
                )}

                {!isBuilding &&
                  !isFixing &&
                  (deployed ? (
                    <div className="flex items-center gap-3 pt-1">
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
                  ) : (
                    <Button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="w-full sm:w-auto"
                    >
                      {deploying ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="mr-2 h-4 w-4" />
                      )}
                      {deploying
                        ? "Deploying..."
                        : deployFailed
                          ? "Retry Deployment"
                          : "Deploy to Vercel"}
                    </Button>
                  ))}
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
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="leading-relaxed font-medium">
                    Connect Railway to deploy your backend. It&apos;s free to
                    start (~$5/mo after a small free allowance). Here&apos;s
                    how:
                  </p>
                </div>
                <RailwaySetupSteps />
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
            <CardTitle className="text-lg">Setup checklist</CardTitle>
            <CardDescription>
              The one-time technical setup to finish wiring up your app. (For
              what to click through and test, see &ldquo;What changed &amp; what
              to test&rdquo; above.)
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

      {/* Deploy failures are shown inline in the Deploy card above so the
          deploy + env-vars cards stay visible. */}

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
