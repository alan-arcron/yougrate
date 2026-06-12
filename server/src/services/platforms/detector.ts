import type {
  DetectedPlatform,
  SupabaseService,
  BackendType,
  BackendDetails,
} from "../../types";

interface PlatformSignature {
  platform: DetectedPlatform;
  filePatterns: RegExp[];
  contentPatterns: RegExp[];
  importPatterns: RegExp[];
}

const SIGNATURES: PlatformSignature[] = [
  {
    platform: "base44",
    filePatterns: [/base44/i, /\.base44/],
    contentPatterns: [/base44\.app/i, /from\s+['"]@base44/i, /base44-sdk/i],
    importPatterns: [/@base44\/sdk/i, /base44-/i],
  },
  {
    platform: "lovable",
    filePatterns: [/lovable/i, /\.lovable/],
    contentPatterns: [/lovable\.dev/i, /from\s+['"]@lovable/i, /lovable-tagger/i],
    importPatterns: [/@lovable/i, /lovable-/i],
  },
  {
    platform: "replit",
    filePatterns: [/\.replit$/, /replit\.nix$/],
    contentPatterns: [/replit\.com/i, /from\s+['"]@replit/i, /replit-db/i],
    importPatterns: [/@replit\/database/i, /@replit\//i],
  },
  {
    platform: "bolt",
    filePatterns: [/bolt\.new/i, /\.bolt/],
    contentPatterns: [/bolt\.new/i, /from\s+['"]@bolt/i, /stackblitz/i],
    importPatterns: [/@bolt/i, /bolt-/i],
  },
];

export interface AnalysisResult {
  platform: DetectedPlatform;
  confidence: number;
  services: SupabaseService[];
  filesToMigrate: string[];
  totalFiles: number;
  details: string[];
  backendType: BackendType;
  backendDetails: BackendDetails;
}

const SERVER_DIR_NAMES = ["server", "backend", "api"];

/**
 * Pull `scripts.start` out of a package.json content string, tolerating parse
 * errors. Returns undefined if missing/unparseable.
 */
function readStartCommand(content: string | undefined): string | undefined {
  if (!content) return undefined;
  try {
    const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
    return pkg.scripts?.start;
  } catch {
    return undefined;
  }
}

/**
 * Classify the app's backend architecture so we can route deployment:
 * - "server": a real long-running server (Express/Fastify/WebSocket/Replit) that
 *   Vercel cannot host and should go to Railway.
 * - "edge_functions": serverless functions (Supabase Edge Functions / Deno) that
 *   belong on Supabase.
 * - "supabase_only": frontend that talks directly to Supabase (default).
 *
 * "server" takes precedence over "edge_functions" because it's the case that
 * cannot deploy to Vercel and needs a separate host.
 */
export function detectBackend(
  files: string[],
  fileContents: Map<string, string>,
): { type: BackendType; details: BackendDetails } {
  const normalized = files.map((f) => f.split("\\").join("/"));

  // --- Edge / serverless functions ---
  const edgeFunctions = new Set<string>();
  for (const f of normalized) {
    const m = f.match(/(?:^|\/)supabase\/functions\/([^/]+)\//);
    if (m && m[1] !== "_shared") edgeFunctions.add(m[1]);
  }
  let hasDenoFunctions = false;
  for (const [, content] of fileContents) {
    if (/Deno\.serve\s*\(/.test(content) || /createClientFromRequest/.test(content)) {
      hasDenoFunctions = true;
      break;
    }
  }

  // --- Long-running server ---
  const hasReplitConfig = normalized.some(
    (f) => f === ".replit" || f.endsWith("/.replit") || f === "replit.nix" || f.endsWith("/replit.nix"),
  );

  let serverDir: string | undefined;
  let serverSignal = "";

  const SERVER_CONTENT = [
    { re: /\bapp\.listen\s*\(/, label: "app.listen()" },
    { re: /from\s+['"]express['"]|require\(\s*['"]express['"]\s*\)/, label: "Express" },
    { re: /from\s+['"]fastify['"]|require\(\s*['"]fastify['"]\s*\)/, label: "Fastify" },
    { re: /new\s+WebSocket(?:Server)?\s*\(|from\s+['"]ws['"]|require\(\s*['"]ws['"]\s*\)/, label: "WebSocket server" },
    { re: /from\s+['"]socket\.io['"]|require\(\s*['"]socket\.io['"]\s*\)/, label: "Socket.IO" },
    { re: /from\s+['"]@hono\/node-server['"]/, label: "Hono node server" },
    { re: /from\s+['"]bullmq['"]|require\(\s*['"]bullmq['"]\s*\)|from\s+['"]node-cron['"]/, label: "background worker/cron" },
  ];

  for (const [filePath, content] of fileContents) {
    // Skip Supabase Edge Functions — those are serverless, not a server.
    const fp = filePath.split("\\").join("/");
    if (/(?:^|\/)supabase\/functions\//.test(fp)) continue;
    for (const sig of SERVER_CONTENT) {
      if (sig.re.test(content)) {
        serverSignal = sig.label;
        const parts = fp.split("/");
        const topDir = parts.length > 1 ? parts[0] : "";
        if (SERVER_DIR_NAMES.includes(topDir)) serverDir = topDir;
        break;
      }
    }
    if (serverSignal && serverDir) break;
  }

  const hasServer = hasReplitConfig || !!serverSignal;

  if (hasServer) {
    const dir = serverDir ?? ".";
    const pkgPath =
      dir === "." ? "package.json" : `${dir}/package.json`;
    const startCommand =
      readStartCommand(fileContents.get(pkgPath)) ??
      readStartCommand(fileContents.get("package.json"));
    const reasons: string[] = [];
    if (serverSignal) reasons.push(`detected ${serverSignal}`);
    if (hasReplitConfig) reasons.push("Replit config present");
    const details: BackendDetails = {
      reason: `Needs a persistent server (${reasons.join(", ")}).`,
      server_dir: dir,
    };
    if (startCommand) details.start_command = startCommand;
    if (edgeFunctions.size > 0) {
      details.edge_functions = Array.from(edgeFunctions);
    }
    return { type: "server", details };
  }

  if (edgeFunctions.size > 0 || hasDenoFunctions) {
    const names = Array.from(edgeFunctions);
    const reason =
      names.length > 0
        ? `Uses ${names.length} serverless function(s): ${names.join(", ")}.`
        : "Uses serverless (Deno) backend functions.";
    return {
      type: "edge_functions",
      details: { reason, edge_functions: names },
    };
  }

  return {
    type: "supabase_only",
    details: {
      reason: "Frontend talks directly to Supabase; no separate backend.",
    },
  };
}

export function detectPlatform(
  files: string[],
  fileContents: Map<string, string>
): AnalysisResult {
  const scores = new Map<DetectedPlatform, number>();
  const details: string[] = [];
  const filesToMigrate = new Set<string>();
  const services = new Set<SupabaseService>();

  for (const sig of SIGNATURES) {
    let score = 0;

    for (const file of files) {
      for (const pattern of sig.filePatterns) {
        if (pattern.test(file)) {
          score += 10;
          details.push(`Config file match: ${file} -> ${sig.platform}`);
          filesToMigrate.add(file);
        }
      }
    }

    for (const [filePath, content] of fileContents) {
      for (const pattern of sig.contentPatterns) {
        if (pattern.test(content)) {
          score += 5;
          filesToMigrate.add(filePath);
        }
      }
      for (const pattern of sig.importPatterns) {
        if (pattern.test(content)) {
          score += 8;
          filesToMigrate.add(filePath);
        }
      }
    }

    scores.set(sig.platform, score);
  }

  // Detect what Supabase services are needed
  for (const [, content] of fileContents) {
    if (/database|db\.|query|select\(|insert\(|update\(|\.from\(/i.test(content)) {
      services.add("database");
    }
    if (/auth|login|signup|sign.?up|sign.?in|session|getUser/i.test(content)) {
      services.add("auth");
    }
    if (/upload|storage|bucket|file.*upload|blob/i.test(content)) {
      services.add("storage");
    }
    if (/serverless|edge.*function|api.*route|functions/i.test(content)) {
      services.add("edge_functions");
    }
    if (/realtime|subscribe|on\(\s*['"]postgres_changes/i.test(content)) {
      services.add("realtime");
    }
  }

  let bestPlatform: DetectedPlatform = "unknown";
  let bestScore = 0;
  for (const [platform, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestPlatform = platform;
    }
  }

  const confidence = Math.min(100, bestScore);

  const backend = detectBackend(files, fileContents);

  return {
    platform: bestPlatform,
    confidence,
    services: Array.from(services),
    filesToMigrate: Array.from(filesToMigrate),
    totalFiles: files.length,
    details,
    backendType: backend.type,
    backendDetails: backend.details,
  };
}
