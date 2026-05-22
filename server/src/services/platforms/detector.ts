import type { DetectedPlatform, SupabaseService } from "../../types";

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

  return {
    platform: bestPlatform,
    confidence,
    services: Array.from(services),
    filesToMigrate: Array.from(filesToMigrate),
    totalFiles: files.length,
    details,
  };
}
