/*
 * Tolerant Postgres connection-string parser.
 *
 * WHY THIS EXISTS: `new URL()` (and pg's own `pg-connection-string`) throw
 * "Invalid URL" when the password contains characters that are legal in a
 * Postgres password but special in a URL — most commonly `/`, `#`, and `?`.
 * Supabase's Session/Transaction pooler strings look like
 *
 *   postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
 *
 * and users paste their LITERAL database password in place of <password>. When
 * that password contains `/`, `#`, or `?`, strict URL parsing rejects a
 * perfectly valid pooler string ("this doesn't look like a connection string"),
 * and even if validation passed, connecting via `{ connectionString }` would
 * fail the same way. So we parse the authority ourselves and treat the password
 * as a literal.
 *
 * The separator between userinfo and host is the LAST `@` in the string: a
 * hostname never contains `@`, so the rightmost `@` is unambiguous even when the
 * password itself contains one. The first `:` in the userinfo splits user from
 * password (the password may contain further colons).
 */

export interface ParsedPgConn {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    // Not valid percent-encoding (e.g. a literal '%') — use as-is.
    return v;
  }
}

/**
 * Parse a `postgres(ql)://user:pass@host[:port][/db][?query]` string without
 * failing on special characters in the password. Returns null if the string is
 * not a recognizable Postgres URI. The password is returned as a literal value
 * (not percent-decoded), matching how Supabase presents it.
 */
export function parsePgConnString(raw: string): ParsedPgConn | null {
  const s = raw.trim();
  const proto = s.match(/^postgres(?:ql)?:\/\//i);
  if (!proto) return null;

  const rest = s.slice(proto[0].length);
  const at = rest.lastIndexOf("@");
  if (at === -1) return null;

  const userinfo = rest.slice(0, at);
  let hostSection = rest.slice(at + 1);
  if (!userinfo || !hostSection) return null;

  const colon = userinfo.indexOf(":");
  const user = safeDecode(colon === -1 ? userinfo : userinfo.slice(0, colon));
  // Keep the password literal — do NOT percent-decode. Supabase shows the raw
  // password, so `pa/ss` means the password is literally `pa/ss`.
  const password = colon === -1 ? "" : userinfo.slice(colon + 1);

  // Strip query/fragment (e.g. ?sslmode=require) before host/db parsing.
  const q = hostSection.search(/[?#]/);
  if (q !== -1) hostSection = hostSection.slice(0, q);

  // hostSection = host[:port][/database]
  let hostPort = hostSection;
  let database = "postgres";
  const slash = hostSection.indexOf("/");
  if (slash !== -1) {
    hostPort = hostSection.slice(0, slash);
    const db = hostSection.slice(slash + 1);
    if (db) database = safeDecode(db);
  }

  const hp = hostPort.match(/^([^:/]+)(?::(\d+))?$/);
  if (!hp || !hp[1]) return null;
  const host = hp[1];
  const port = hp[2] ? parseInt(hp[2], 10) : 5432;

  return { user, password, host, port, database };
}

/**
 * Build a discrete `pg.Client` config from a connection string. Passing fields
 * individually (rather than `{ connectionString }`) sidesteps pg's own URL
 * parser, which chokes on the same special-character passwords. Returns null if
 * the string can't be parsed.
 */
export function pgClientConfig(
  raw: string,
): ParsedPgConn | null {
  return parsePgConnString(raw);
}
