import { Client } from "pg";
import * as s3 from "./s3";
import { redactSecrets } from "../utils/redact";

const SCHEMA_KEY_SUFFIX = "migrated/supabase/migrations/001_initial_schema.sql";

/**
 * Validate that a connection string is a Postgres URL pointing at a Supabase
 * host. Restricting the host both enforces the product contract (target must be
 * Supabase) and limits SSRF — we won't open DB connections to arbitrary
 * internal hosts on the user's behalf.
 */
export function validateSupabaseConnectionString(
  raw: string,
): { ok: true; host: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid connection string." };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, error: "Connection string must start with postgresql://" };
  }
  const host = url.hostname.toLowerCase();
  const allowed = host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
  if (!allowed) {
    return {
      ok: false,
      error:
        "Only Supabase database hosts are allowed (e.g. db.<ref>.supabase.co or aws-0-<region>.pooler.supabase.com).",
    };
  }
  return { ok: true, host };
}

/** Read the generated schema SQL for a migration, or null if it doesn't exist. */
export async function readGeneratedSchema(
  s3Prefix: string,
): Promise<string | null> {
  try {
    return await s3.downloadFile(`${s3Prefix}/${SCHEMA_KEY_SUFFIX}`);
  } catch {
    return null;
  }
}

function friendlyConnError(err: unknown): string {
  const code = (err as { code?: string }).code;
  const raw = err instanceof Error ? err.message : String(err);
  if (code === "ENOTFOUND") {
    return "Database host not found — double-check the connection string.";
  }
  if (code === "ECONNREFUSED") {
    return "Connection refused by the database host.";
  }
  if (code === "28P01") {
    return "Authentication failed — check your database password.";
  }
  if (code === "ETIMEDOUT" || /timeout/i.test(raw)) {
    return "Timed out connecting to the database. Use the Session/Direct connection string (port 5432).";
  }
  return `Could not connect to the database: ${redactSecrets(raw)}`;
}

/**
 * Execute the generated schema SQL against the target Supabase database.
 * The whole SQL is sent as a single simple query, so Postgres runs it in one
 * implicit transaction — a failure rolls the entire batch back rather than
 * leaving a half-applied schema.
 */
export async function applySchema(
  connectionString: string,
  sql: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
  });

  try {
    await client.connect();
  } catch (err) {
    return { ok: false, error: friendlyConnError(err) };
  }

  try {
    await client.query(sql);
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Schema failed to apply: ${redactSecrets(raw)}` };
  } finally {
    await client.end().catch(() => {});
  }
}
