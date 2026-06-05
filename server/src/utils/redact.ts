const REDACTION = "***REDACTED***";

// Patterns for credentials that must never appear in logs.
const PATTERNS: RegExp[] = [
  // userinfo credentials embedded in URLs: https://user:pass@host
  /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi,
  // GitHub's x-access-token URL form
  /x-access-token:[^@\s]+/gi,
  // GitHub token formats (PAT, OAuth, app, refresh, server)
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
];

/** Strip known credential/token patterns from an arbitrary string. */
export function redactSecrets(input: string): string {
  let out = input;
  out = out.replace(PATTERNS[0], `$1${REDACTION}@`);
  for (let i = 1; i < PATTERNS.length; i++) {
    out = out.replace(PATTERNS[i], REDACTION);
  }
  return out;
}

/** Redact secrets from any value (Error, string, object) for safe logging. */
export function redactError(err: unknown): string {
  const msg =
    err instanceof Error
      ? `${err.message}${err.stack ? `\n${err.stack}` : ""}`
      : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
  return redactSecrets(msg);
}
