import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

/** Build the public Supabase URL from a project ref/ID. */
export function refToUrl(ref: string): string {
  return ref ? `https://${ref}.supabase.co` : "";
}

/** Extract the project ref/ID from a Supabase URL (e.g. https://<ref>.supabase.co). */
export function urlToRef(url: string | null | undefined): string {
  if (!url) return "";
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(co|com)/i);
  return m ? m[1] : "";
}

/** Normalize whatever the user pastes into a bare project ref. */
export function normalizeRef(input: string): string {
  const raw = input.trim();
  if (raw.includes("supabase.")) return urlToRef(raw);
  return raw.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Client-side sanity check for a pasted Supabase connection string, so users
 * see a clear error BEFORE submitting instead of a cryptic failure when we try
 * to apply the schema. Returns an error message, or null if it's empty or looks
 * valid. Mirrors the server's validateSupabaseConnectionString.
 */
export function validateConnString(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
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
export function connStringWarning(raw: string): string | null {
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

interface SupabaseConnectFieldsProps {
  /** Project ref/ID (bare, e.g. "abcdefghijklmnopqrst"). */
  projectId: string;
  /** Called with the normalized ref whenever the Project ID changes. */
  onProjectIdChange: (ref: string) => void;
  anonKey: string;
  onAnonKeyChange: (key: string) => void;
  connString: string;
  onConnStringChange: (conn: string) => void;
  /** Prefix for input ids so multiple instances don't collide. */
  idPrefix?: string;
  /** Extra className applied to inputs (e.g. "bg-white"). */
  inputClassName?: string;
  /** Optional extra note under the connection string field. */
  connNote?: ReactNode;
}

/**
 * Shared Supabase project connection form: Project ID -> (Anon Key + Session
 * Pooler connection string), with the same guided instructions and validation
 * everywhere it's used (migration estimate step and project settings).
 */
export function SupabaseConnectFields({
  projectId,
  onProjectIdChange,
  anonKey,
  onAnonKeyChange,
  connString,
  onConnStringChange,
  idPrefix = "sb",
  inputClassName = "",
  connNote,
}: SupabaseConnectFieldsProps) {
  const url = refToUrl(projectId);
  const anonKeyUrl = projectId
    ? `https://supabase.com/dashboard/project/${projectId}/settings/api-keys/legacy`
    : "";
  const connError = validateConnString(connString);
  const connWarning = connError ? null : connStringWarning(connString);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-supabase-id`}>Supabase Project ID</Label>
        <Input
          className={inputClassName}
          id={`${idPrefix}-supabase-id`}
          placeholder="abcdefghijklmnopqrst"
          value={projectId}
          onChange={(e) => onProjectIdChange(normalizeRef(e.target.value))}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Found in your{" "}
          <a
            href="https://supabase.com/dashboard/projects"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Supabase dashboard
          </a>{" "}
          under <strong>Project Settings &rarr; General</strong> (the
          &ldquo;Reference ID&rdquo;), or as the{" "}
          <code className="bg-muted px-1 rounded">&lt;id&gt;</code> in your
          project URL.
          {projectId && (
            <>
              {" "}
              Your project URL:{" "}
              <code className="bg-muted px-1 rounded">{url}</code>
            </>
          )}
        </p>
      </div>

      {projectId && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-supabase-key`}>Anon Key</Label>
            <Input
              className={inputClassName}
              id={`${idPrefix}-supabase-key`}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={anonKey}
              onChange={(e) => onAnonKeyChange(e.target.value)}
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              <a
                href={anonKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Click here
              </a>{" "}
              and copy the{" "}
              <code className="bg-muted px-1 rounded">anon</code> /{" "}
              <code className="bg-muted px-1 rounded">public</code> key (under
              &ldquo;Legacy anon, service_role API keys&rdquo;). It&apos;s public
              and safe to embed.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-supabase-conn`}>
              Session Pooler connection string
            </Label>
            <Input
              id={`${idPrefix}-supabase-conn`}
              type="password"
              autoComplete="off"
              placeholder="postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres"
              value={connString}
              onChange={(e) => onConnStringChange(e.target.value)}
              className={`font-mono text-xs ${inputClassName} ${
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
            <p className="text-sm text-muted-foreground leading-relaxed">
              <a
                href={`https://supabase.com/dashboard/project/${projectId}?showConnect=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Click here
              </a>{" "}
              and scroll down to copy the{" "}
              <strong>connection string</strong> URI, and replace{" "}
              <code className="bg-muted px-1 rounded">[YOUR-PASSWORD]</code> with
              your database password. Stored encrypted.
            </p>
            {connNote && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {connNote}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
