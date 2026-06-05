export type ProjectStatus =
  | "created"
  | "analyzing"
  | "analyzed"
  | "migrating"
  | "migrated"
  | "deploying"
  | "deployed"
  | "failed";

export type MigrationStatus =
  | "pending"
  | "analyzing"
  | "estimated"
  | "confirmed"
  | "running"
  | "completed"
  | "building"
  | "fixing"
  | "budget_exceeded"
  | "pending_review"
  | "reviewing"
  | "reviewed"
  | "failed";

export type MigrationFileStatus =
  | "pending"
  | "migrating"
  | "completed"
  | "skipped"
  | "failed";

export type DetectedPlatform =
  | "base44"
  | "lovable"
  | "replit"
  | "bolt"
  | "unknown";

export type SupabaseService =
  | "database"
  | "auth"
  | "storage"
  | "edge_functions"
  | "realtime";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  github_access_token: string | null;
  github_username: string | null;
  vercel_access_token: string | null;
  stripe_customer_id: string | null;
  free_analyses_used: number;
  free_analyses_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  github_repo_url: string;
  github_repo_full_name: string;
  default_branch: string;
  detected_platform: DetectedPlatform | null;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Migration {
  id: string;
  project_id: string;
  status: MigrationStatus;
  detected_platform: DetectedPlatform | null;
  detected_services: SupabaseService[];
  total_files: number;
  files_to_migrate: number;
  files_migrated: number;
  current_file: string | null;
  analysis_input_tokens: number;
  analysis_output_tokens: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_cents: number;
  actual_input_tokens: number;
  actual_output_tokens: number;
  actual_cost_cents: number;
  output_type: "new" | "fork" | "branch" | null;
  output_repo_url: string | null;
  output_branch: string | null;
  error_message: string | null;
  committed_secrets: string[];
  migration_log: MigrationLogEntry[];
  addon_data_migration: boolean;
  addon_code_review: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MigrationLogEntry {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
}

export interface MigrationFile {
  id: string;
  migration_id: string;
  file_path: string;
  status: MigrationFileStatus;
  original_content: string | null;
  migrated_content: string | null;
  changes_summary: Record<string, unknown> | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface BillingEvent {
  id: string;
  user_id: string;
  migration_id: string | null;
  input_tokens: number;
  output_tokens: number;
  raw_cost_cents: number;
  billed_cost_cents: number;
  markup_multiplier: number;
  stripe_invoice_id: string | null;
  status: "pending" | "invoiced" | "paid" | "failed";
  created_at: string;
}

export interface CostEstimate {
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  raw_cost_cents: number;
  billed_cost_cents: number;
  markup_multiplier: number;
}

// Anthropic pricing (cents per 1M tokens)
export const ANTHROPIC_PRICING = {
  "claude-opus-4-7": { input: 500, output: 2500 },
  "claude-opus-4-6-20250115": { input: 500, output: 2500 },
  "claude-sonnet-4-6": { input: 300, output: 1500 },
} as const;
