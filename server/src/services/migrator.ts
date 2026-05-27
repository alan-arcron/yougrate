import { db } from "../db";
import { detectPlatform } from "./platforms/detector";
import {
  analyzeFile,
  migrateFile,
  fixBuildErrors,
  estimateTokens,
  calculateCost,
  generateSupabaseSchema,
  MODEL,
  type AnalysisContext,
} from "./ai";
import * as s3 from "./s3";
import * as github from "./github";
import * as vercel from "./vercel";
import fs from "fs/promises";
import path from "path";
import type { Migration, MigrationLogEntry, SupabaseService } from "../types";

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("529") || raw.includes("overloaded")) {
    return "The AI model is temporarily at capacity. Please try again in a few minutes.";
  }
  if (raw.includes("rate_limit") || raw.includes("429")) {
    return "Rate limit reached. Please wait a moment and try again.";
  }
  if (raw.includes("authentication") || raw.includes("401")) {
    return "AI service authentication failed. Please contact support.";
  }
  return raw;
}

function log(
  migrationId: string,
  message: string,
  level: MigrationLogEntry["level"] = "info",
) {
  const entry: MigrationLogEntry = {
    timestamp: new Date().toISOString(),
    message,
    level,
  };
  console.log(`[migrator:${migrationId.slice(0, 8)}] ${message}`);
  return db("migrations")
    .where({ id: migrationId })
    .update({
      migration_log: db.raw("migration_log || ?::jsonb", [
        JSON.stringify(entry),
      ]),
    });
}

async function updateMigration(
  migrationId: string,
  updates: Partial<Migration>,
) {
  await db("migrations").where({ id: migrationId }).update({
    ...updates,
    updated_at: new Date().toISOString(),
  });
}

const TOKEN_BUDGET_MULTIPLIER = 2;

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".svg",
  ".webp",
  ".avif",
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".webm",
  ".avi",
  ".mov",
  ".flac",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".xz",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".o",
  ".a",
  ".pyc",
  ".pyo",
  ".class",
  ".jar",
  ".lock",
  ".sum",
  ".map",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".next",
  "vendor",
  "target",
]);

function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  if (BINARY_EXTENSIONS.has(ext)) return false;
  if (basename.endsWith(".min.js") || basename.endsWith(".min.css"))
    return false;
  const parts = filePath.split(path.sep);
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  return true;
}

export async function runAnalysis(
  migrationId: string,
  modelOverride?: string,
): Promise<void> {
  const migration = await db("migrations").where({ id: migrationId }).first();
  if (!migration) throw new Error("Migration not found");

  const project = await db("projects")
    .where({ id: migration.project_id })
    .first();
  if (!project) throw new Error("Project not found");

  const user = await db("users").where({ id: project.user_id }).first();
  if (!user?.github_access_token) throw new Error("GitHub not connected");

  try {
    await updateMigration(migrationId, { status: "analyzing" });
    await db("projects")
      .where({ id: project.id })
      .update({ status: "analyzing" });
    await log(migrationId, "Starting analysis...");

    const s3Prefix = s3.getWorkspacePrefix(project.id, migrationId);

    // Check if workspace already exists in S3 (from a previous interrupted run)
    const existingWorkspace = await s3.listFiles(s3Prefix);
    let localPath: string;
    let allFiles: string[];

    if (existingWorkspace.length > 0) {
      await log(
        migrationId,
        `Workspace already exists in S3 (${existingWorkspace.length} files), skipping clone/upload`,
      );
      localPath = await github.cloneRepo(
        user.github_access_token,
        project.github_repo_full_name,
        project.default_branch,
      );
      allFiles = await github.getRepoFiles(localPath);
    } else {
      await log(migrationId, `Cloning ${project.github_repo_full_name}...`);
      localPath = await github.cloneRepo(
        user.github_access_token,
        project.github_repo_full_name,
        project.default_branch,
      );
      allFiles = await github.getRepoFiles(localPath);
      await log(
        migrationId,
        `Found ${allFiles.length} files, uploading to workspace...`,
      );
      await s3.uploadDirectory(localPath, s3Prefix);
    }

    const codeFiles = allFiles.filter(isCodeFile);
    await log(
      migrationId,
      `Found ${allFiles.length} files (${codeFiles.length} code files)`,
    );

    // Read code files for platform detection and analysis
    const fileContents = new Map<string, string>();
    for (const file of codeFiles) {
      try {
        const content = await fs.readFile(path.join(localPath, file), "utf-8");
        if (content.length <= 100_000) {
          fileContents.set(file, content);
        }
      } catch {
        // skip unreadable files
      }
    }

    // Detect platform
    const analysis = detectPlatform(codeFiles, fileContents);
    await log(
      migrationId,
      `Detected platform: ${analysis.platform} (confidence: ${analysis.confidence}%)`,
    );
    await log(
      migrationId,
      `Services to migrate: ${analysis.services.join(", ") || "none detected"}`,
    );

    if (analysis.filesToMigrate.length > 0) {
      await log(
        migrationId,
        `Pattern matching flagged ${analysis.filesToMigrate.length} platform files: ${analysis.filesToMigrate.join(", ")}`,
      );
    }
    if (analysis.details.length > 0) {
      for (const detail of analysis.details) {
        await log(migrationId, `  ${detail}`);
      }
    }

    // Build context for AI analysis
    const aiContext: AnalysisContext = {
      platform: analysis.platform,
      targetServices: analysis.services,
      platformFiles: analysis.filesToMigrate,
      platformPatterns: analysis.details,
      modelOverride,
    };

    // Use Claude to analyze files that need migration
    let analysisInput = 0;
    let analysisOutput = 0;
    let migrationEstInput = 0;
    let migrationEstOutput = 0;
    const filesToMigrate: string[] = [];
    const analyzableFiles = codeFiles.filter((f) => fileContents.has(f));

    // Check for previously analyzed files (cache from interrupted runs)
    const existingFiles = await db("migration_files")
      .where({ migration_id: migrationId })
      .select("file_path", "status", "input_tokens", "output_tokens");
    const alreadyAnalyzed = new Set(
      existingFiles.map((f: { file_path: string }) => f.file_path),
    );

    // Tally up tokens from cached results
    for (const ef of existingFiles) {
      analysisInput += ef.input_tokens || 0;
      analysisOutput += ef.output_tokens || 0;
      if (ef.status === "pending") {
        filesToMigrate.push(ef.file_path);
        const est = estimateTokens(fileContents.get(ef.file_path) || "");
        migrationEstInput += est.input;
        migrationEstOutput += est.output;
      }
    }

    const remaining = analyzableFiles.filter((f) => !alreadyAnalyzed.has(f));

    if (alreadyAnalyzed.size > 0) {
      await log(
        migrationId,
        `Resuming: ${alreadyAnalyzed.size} files cached, ${remaining.length} remaining`,
      );
    }

    await log(
      migrationId,
      `Analyzing ${remaining.length} files with ${modelOverride || MODEL}...`,
    );

    for (let i = 0; i < remaining.length; i++) {
      const file = remaining[i];
      const content = fileContents.get(file)!;

      await log(
        migrationId,
        `[${i + 1}/${remaining.length}] Reviewing ${file}...`,
      );

      const est = estimateTokens(content);
      const aiResult = await analyzeFile(file, content, aiContext);
      analysisInput += aiResult.inputTokens;
      analysisOutput += aiResult.outputTokens;

      if (aiResult.needsMigration) {
        filesToMigrate.push(file);
        migrationEstInput += est.input;
        migrationEstOutput += est.output;

        await log(migrationId, `  ✓ Needs migration: ${aiResult.reason}`);

        await db("migration_files").insert({
          migration_id: migrationId,
          file_path: file,
          status: "pending",
          changes_summary: JSON.stringify({ reason: aiResult.reason }),
          input_tokens: aiResult.inputTokens,
          output_tokens: aiResult.outputTokens,
        });
      } else {
        await db("migration_files").insert({
          migration_id: migrationId,
          file_path: file,
          status: "skipped",
          changes_summary: JSON.stringify({ reason: aiResult.reason }),
          input_tokens: aiResult.inputTokens,
          output_tokens: aiResult.outputTokens,
        });
        await log(migrationId, `  — Skipped: ${aiResult.reason}`);
      }
    }

    const cost = calculateCost(migrationEstInput, migrationEstOutput);

    await updateMigration(migrationId, {
      status: "estimated",
      detected_platform: analysis.platform,
      detected_services: JSON.stringify(
        analysis.services,
      ) as unknown as SupabaseService[],
      total_files: allFiles.length,
      files_to_migrate: filesToMigrate.length,
      analysis_input_tokens: analysisInput,
      analysis_output_tokens: analysisOutput,
      estimated_input_tokens: migrationEstInput,
      estimated_output_tokens: migrationEstOutput,
      estimated_cost_cents: cost.billedCostCents,
    });

    await db("projects").where({ id: project.id }).update({
      status: "analyzed",
      detected_platform: analysis.platform,
    });

    await log(
      migrationId,
      `Analysis complete: ${filesToMigrate.length} files need migration`,
    );
    await log(
      migrationId,
      `Analysis used ${(analysisInput + analysisOutput).toLocaleString()} tokens (${analysisInput.toLocaleString()} in / ${analysisOutput.toLocaleString()} out)`,
    );
    await log(
      migrationId,
      `Model: ${MODEL} | Base fee: $${(cost.baseFeeCents / 100).toFixed(2)} + Token cost: $${(cost.tokenCostCents / 100).toFixed(2)} = Total: $${(cost.billedCostCents / 100).toFixed(2)}`,
    );

    // Cleanup temp dir
    await fs.rm(localPath, { recursive: true, force: true });
  } catch (err: unknown) {
    const message = friendlyError(err);
    await updateMigration(migrationId, {
      status: "failed",
      error_message: message,
    });
    await db("projects").where({ id: project.id }).update({ status: "failed" });
    await log(migrationId, `Analysis failed: ${message}`, "error");
    throw err;
  }
}

export async function runMigration(migrationId: string): Promise<void> {
  const migration = await db("migrations").where({ id: migrationId }).first();
  if (!migration) throw new Error("Migration not found");

  const project = await db("projects")
    .where({ id: migration.project_id })
    .first();
  if (!project) throw new Error("Project not found");

  if (!project.supabase_url || !project.supabase_anon_key) {
    throw new Error("Supabase project not connected");
  }

  try {
    await updateMigration(migrationId, {
      status: "running",
      started_at: migration.started_at || new Date().toISOString(),
    });
    await db("projects")
      .where({ id: project.id })
      .update({ status: "migrating" });

    // Count files already completed from prior runs
    const previouslyCompleted = await db("migration_files")
      .where({ migration_id: migrationId, status: "completed" })
      .count("id as count")
      .first();
    let filesMigrated = Number(previouslyCompleted?.count || 0);

    // Tally tokens from previously completed files
    const prevTokens = await db("migration_files")
      .where({ migration_id: migrationId, status: "completed" })
      .sum("input_tokens as input")
      .sum("output_tokens as output")
      .first();
    let totalInput = Number(prevTokens?.input || 0);
    let totalOutput = Number(prevTokens?.output || 0);

    // Get pending and failed files to process
    const pendingFiles = await db("migration_files")
      .where({ migration_id: migrationId })
      .whereIn("status", ["pending", "failed", "migrating"])
      .orderBy("file_path");

    const totalFilesToMigrate = filesMigrated + pendingFiles.length;

    await log(
      migrationId,
      `Starting migration... (${filesMigrated} already done, ${pendingFiles.length} remaining)`,
    );
    await updateMigration(migrationId, { files_migrated: filesMigrated });

    const s3Prefix = s3.getWorkspacePrefix(project.id, migrationId);

    for (const file of pendingFiles) {
      await log(migrationId, `Migrating: ${file.file_path}`);
      await updateMigration(migrationId, { current_file: file.file_path });
      await db("migration_files")
        .where({ id: file.id })
        .update({ status: "migrating" });

      try {
        const originalContent = await s3.downloadFile(
          `${s3Prefix}/${file.file_path}`,
        );
        const result = await migrateFile(
          file.file_path,
          originalContent,
          migration.detected_platform,
          project.supabase_url,
          migration.detected_services,
        );

        totalInput += result.inputTokens;
        totalOutput += result.outputTokens;
        filesMigrated++;

        await db("migration_files").where({ id: file.id }).update({
          status: "completed",
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        });

        await s3.uploadFile(
          `${s3Prefix}/migrated/${file.file_path}`,
          result.content,
        );

        await updateMigration(migrationId, {
          files_migrated: filesMigrated,
          actual_input_tokens: totalInput,
          actual_output_tokens: totalOutput,
        });

        const estimatedTotal = (migration.estimated_input_tokens || 0) + (migration.estimated_output_tokens || 0);
        const actualTotal = totalInput + totalOutput;
        if (estimatedTotal > 0 && actualTotal > estimatedTotal * TOKEN_BUDGET_MULTIPLIER) {
          const filesRemaining = totalFilesToMigrate - filesMigrated;
          const tokensPerFile = actualTotal / filesMigrated;
          const projectedRemaining = Math.ceil(tokensPerFile * filesRemaining * 1.1);
          const inputRatio = totalInput / actualTotal;
          const projectedRemainingInput = Math.ceil(projectedRemaining * inputRatio);
          const projectedRemainingOutput = projectedRemaining - projectedRemainingInput;
          const remainingCost = calculateCost(projectedRemainingInput, projectedRemainingOutput);
          const overageCents = remainingCost.tokenCostCents;

          const actualCost = calculateCost(totalInput, totalOutput);
          await updateMigration(migrationId, {
            status: "budget_exceeded",
            error_message: `Token usage (${actualTotal.toLocaleString()}) exceeded ${TOKEN_BUDGET_MULTIPLIER}x the estimate. ${filesMigrated}/${totalFilesToMigrate} files completed. Pay $${(overageCents / 100).toFixed(2)} to continue the remaining ${filesRemaining} files.`,
            actual_input_tokens: totalInput,
            actual_output_tokens: totalOutput,
            actual_cost_cents: actualCost.billedCostCents,
            current_file: null,
          });
          await log(migrationId, `Budget cap hit: ${actualTotal.toLocaleString()} tokens used vs ${estimatedTotal.toLocaleString()} estimated. Waiting for overage payment.`, "warn");
          return;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await db("migration_files")
          .where({ id: file.id })
          .update({ status: "failed" });
        await log(
          migrationId,
          `Failed to migrate ${file.file_path}: ${message}`,
          "error",
        );
      }
    }

    // Check for any failed files
    const failedFiles = await db("migration_files")
      .where({ migration_id: migrationId, status: "failed" })
      .count("id as count")
      .first();
    const failedCount = Number(failedFiles?.count || 0);

    const actualCost = calculateCost(totalInput, totalOutput);

    if (failedCount > 0) {
      await updateMigration(migrationId, {
        status: "failed",
        error_message: `${failedCount} file(s) failed to migrate. You can retry to attempt them again.`,
        files_migrated: filesMigrated,
        actual_input_tokens: totalInput,
        actual_output_tokens: totalOutput,
        actual_cost_cents: actualCost.billedCostCents,
        current_file: null,
      });
      await db("projects")
        .where({ id: project.id })
        .update({ status: "failed" });
      await log(
        migrationId,
        `Migration incomplete: ${filesMigrated}/${totalFilesToMigrate} succeeded, ${failedCount} failed`,
        "warn",
      );
    } else {
      // Run data migration add-on if selected
      if (migration.addon_data_migration) {
        await log(migrationId, "Generating Supabase SQL schema from source code...");
        try {
          const dbFiles = await db("migration_files")
            .where({ migration_id: migrationId, status: "completed" })
            .select("file_path");
          const s3Prefix = s3.getWorkspacePrefix(project.id, migrationId);
          const sourceContents = new Map<string, string>();
          for (const f of dbFiles.slice(0, 30)) {
            try {
              const content = await s3.downloadFile(`${s3Prefix}/${f.file_path}`);
              sourceContents.set(f.file_path, content);
            } catch {
              // skip files that can't be read
            }
          }
          if (sourceContents.size > 0) {
            const schemaResult = await generateSupabaseSchema(
              sourceContents,
              migration.detected_platform || "unknown",
            );
            totalInput += schemaResult.inputTokens;
            totalOutput += schemaResult.outputTokens;
            await s3.uploadFile(
              `${s3Prefix}/migrated/supabase/migrations/001_initial_schema.sql`,
              schemaResult.content,
            );
            await log(migrationId, `SQL schema generated (${schemaResult.inputTokens + schemaResult.outputTokens} tokens)`);
          } else {
            await log(migrationId, "No source files available for schema generation", "warn");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await log(migrationId, `Schema generation failed: ${msg}`, "warn");
        }
      }

      const finalCost = calculateCost(totalInput, totalOutput);
      const finalStatus = migration.addon_code_review ? "pending_review" : "completed";

      await updateMigration(migrationId, {
        status: finalStatus,
        files_migrated: filesMigrated,
        actual_input_tokens: totalInput,
        actual_output_tokens: totalOutput,
        actual_cost_cents: finalCost.billedCostCents,
        current_file: null,
        completed_at: new Date().toISOString(),
      });
      await db("projects")
        .where({ id: project.id })
        .update({ status: "migrated" });

      if (migration.addon_code_review) {
        await log(migrationId, `Migration complete — awaiting senior engineer code review`);
      } else {
        await log(
          migrationId,
          `Migration complete: ${filesMigrated}/${totalFilesToMigrate} files migrated`,
        );
      }
    }
  } catch (err: unknown) {
    const message = friendlyError(err);
    await updateMigration(migrationId, {
      status: "failed",
      error_message: message,
    });
    await db("projects").where({ id: project.id }).update({ status: "failed" });
    await log(migrationId, `Migration failed: ${message}`, "error");
    throw err;
  }
}

export async function pushMigratedCode(
  migrationId: string,
  outputType: "new_repo" | "branch",
  repoName?: string,
): Promise<{ repoUrl: string; branch: string }> {
  const migration = await db("migrations").where({ id: migrationId }).first();
  if (!migration) throw new Error("Migration not found");

  const project = await db("projects")
    .where({ id: migration.project_id })
    .first();
  if (!project) throw new Error("Project not found");

  const user = await db("users").where({ id: project.user_id }).first();
  if (!user?.github_access_token) throw new Error("GitHub not connected");

  const migratedFiles = await db("migration_files")
    .where({ migration_id: migrationId, status: "completed" })
    .select("file_path");

  // Clone original repo to temp dir
  const localPath = await github.cloneRepo(
    user.github_access_token,
    project.github_repo_full_name,
    project.default_branch,
  );

  // Download migrated files from S3 and apply
  const s3Prefix = s3.getWorkspacePrefix(project.id, migrationId);
  for (const file of migratedFiles) {
    const content = await s3.downloadFile(
      `${s3Prefix}/migrated/${file.file_path}`,
    );
    const filePath = path.join(localPath, file.file_path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  let repoUrl: string;
  let branch: string;

  if (outputType === "new_repo") {
    const name = repoName || `${project.name}-supabase`;
    const newRepo = await github.createNewRepo(user.github_access_token, name);
    repoUrl = newRepo.html_url;
    branch = "main";
    await github.pushToRepo(
      user.github_access_token,
      localPath,
      newRepo.full_name,
      branch,
      "Migrate to Vercel and Supabase via Yougrate",
    );
  } else {
    branch = `yougrate/migration`;
    repoUrl = project.github_repo_url;
    await github.pushToRepo(
      user.github_access_token,
      localPath,
      project.github_repo_full_name,
      branch,
      "Migrate to Supabase via Yougrate",
    );
  }

  await updateMigration(migrationId, {
    output_type: outputType,
    output_repo_url: repoUrl,
    output_branch: branch,
  });

  await fs.rm(localPath, { recursive: true, force: true });

  return { repoUrl, branch };
}

const MAX_BUILD_FIX_ATTEMPTS = 3;

export async function runBuildFixLoop(
  migrationId: string,
  deploymentId: string,
): Promise<void> {
  const migration = await db("migrations").where({ id: migrationId }).first();
  if (!migration) throw new Error("Migration not found");

  const project = await db("projects")
    .where({ id: migration.project_id })
    .first();
  if (!project) throw new Error("Project not found");

  const user = await db("users").where({ id: project.user_id }).first();
  if (!user?.vercel_access_token || !user?.github_access_token) {
    throw new Error("Vercel or GitHub not connected");
  }

  try {
    await updateMigration(migrationId, { status: "building" });
    await db("projects")
      .where({ id: project.id })
      .update({ status: "deploying" });

    let currentDeploymentId = deploymentId;

    for (let attempt = 1; attempt <= MAX_BUILD_FIX_ATTEMPTS; attempt++) {
      await log(
        migrationId,
        `Vercel build started (attempt ${attempt}/${MAX_BUILD_FIX_ATTEMPTS}). Waiting for result...`,
      );

      const result = await vercel.waitForDeployment(
        user.vercel_access_token,
        currentDeploymentId,
      );

      if (result.readyState === "READY") {
        await updateMigration(migrationId, { status: "completed" });
        await db("projects")
          .where({ id: project.id })
          .update({ status: "deployed" });
        await log(migrationId, `Build succeeded! Deployed to: ${result.url}`);
        return;
      }

      if (result.readyState === "CANCELED") {
        await updateMigration(migrationId, {
          status: "failed",
          error_message: "Vercel deployment was canceled.",
        });
        await db("projects")
          .where({ id: project.id })
          .update({ status: "failed" });
        await log(migrationId, "Deployment was canceled on Vercel.", "error");
        return;
      }

      if (result.readyState === "ERROR") {
        await log(
          migrationId,
          `Build failed (attempt ${attempt}/${MAX_BUILD_FIX_ATTEMPTS}). Fetching build logs...`,
        );

        const buildLog = await vercel.getDeploymentEvents(
          user.vercel_access_token,
          currentDeploymentId,
        );

        const errorLines = buildLog
          .split("\n")
          .filter((l) =>
            /error|Error|ERR!|failed|Cannot find|Module not found|ENOENT/i.test(
              l,
            ),
          )
          .slice(0, 20)
          .join("\n");
        if (errorLines) {
          await log(migrationId, `Build errors:\n${errorLines}`, "error");
        } else {
          await log(
            migrationId,
            `Build output (last 1500 chars):\n${buildLog.slice(-1500)}`,
            "error",
          );
        }

        if (attempt >= MAX_BUILD_FIX_ATTEMPTS) {
          await updateMigration(migrationId, {
            status: "failed",
            error_message: `Build failed after ${MAX_BUILD_FIX_ATTEMPTS} attempts. Last errors:\n${buildLog.slice(-500)}`,
          });
          await db("projects")
            .where({ id: project.id })
            .update({ status: "failed" });
          await log(
            migrationId,
            `Gave up after ${MAX_BUILD_FIX_ATTEMPTS} attempts. Build errors remain unresolved.`,
            "error",
          );
          return;
        }

        await updateMigration(migrationId, { status: "fixing" });
        await log(
          migrationId,
          `Analyzing build errors with AI (fix attempt ${attempt + 1})...`,
        );

        const s3Prefix = s3.getWorkspacePrefix(project.id, migrationId);
        const errorFiles = extractFilesFromBuildLog(buildLog);
        const fileContents = new Map<string, string>();

        if (errorFiles.length > 0) {
          await log(
            migrationId,
            `Identified ${errorFiles.length} file(s) from errors: ${errorFiles.join(", ")}`,
          );
        }

        for (const filePath of errorFiles) {
          try {
            const content = await s3.downloadFile(
              `${s3Prefix}/migrated/${filePath}`,
            );
            fileContents.set(filePath, content);
          } catch {
            try {
              const content = await s3.downloadFile(`${s3Prefix}/${filePath}`);
              fileContents.set(filePath, content);
            } catch {
              // file not found in S3
            }
          }
        }

        if (fileContents.size === 0) {
          await log(
            migrationId,
            `Could not locate error files in workspace. Loading up to 10 migrated files for context...`,
            "warn",
          );
          const allMigratedFiles = await db("migration_files")
            .where({ migration_id: migrationId, status: "completed" })
            .select("file_path")
            .limit(10);
          for (const f of allMigratedFiles) {
            try {
              const content = await s3.downloadFile(
                `${s3Prefix}/migrated/${f.file_path}`,
              );
              fileContents.set(f.file_path, content);
            } catch {
              /* skip */
            }
          }
          await log(
            migrationId,
            `Loaded ${fileContents.size} file(s) for AI context`,
          );
        }

        const fixResult = await fixBuildErrors(
          buildLog,
          fileContents,
          migration.detected_platform || "unknown",
        );

        if (fixResult.fixes.size === 0) {
          await log(
            migrationId,
            `AI could not determine fixes for these errors.`,
            "error",
          );
          await updateMigration(migrationId, {
            status: "failed",
            error_message: `Build failed and AI could not determine fixes. Errors:\n${buildLog.slice(-500)}`,
          });
          await db("projects")
            .where({ id: project.id })
            .update({ status: "failed" });
          return;
        }

        const fixedFiles = Array.from(fixResult.fixes.keys());
        await log(
          migrationId,
          `AI proposed fixes for: ${fixedFiles.join(", ")} (${fixResult.inputTokens + fixResult.outputTokens} tokens)`,
        );

        for (const [filePath, content] of fixResult.fixes) {
          await s3.uploadFile(`${s3Prefix}/migrated/${filePath}`, content);
        }

        await log(migrationId, `Pushing fixes to GitHub...`);
        const repoFullName = migration.output_repo_url.replace(
          "https://github.com/",
          "",
        );
        const localPath = await github.cloneRepo(
          user.github_access_token,
          repoFullName,
          migration.output_branch || "main",
        );

        for (const [filePath, content] of fixResult.fixes) {
          const fullPath = path.join(localPath, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, "utf-8");
        }

        await github.pushToRepo(
          user.github_access_token,
          localPath,
          repoFullName,
          migration.output_branch || "main",
          `fix: resolve build errors (attempt ${attempt + 1})`,
        );

        await fs.rm(localPath, { recursive: true, force: true });
        await log(migrationId, `Fixes pushed. Triggering new Vercel build...`);

        await updateMigration(migrationId, { status: "building" });

        await new Promise((r) => setTimeout(r, 15_000));
        const latest = await vercel.getLatestDeployment(
          user.vercel_access_token,
          project.name,
        );
        if (latest) {
          currentDeploymentId = latest.id;
          await log(
            migrationId,
            `New deployment detected (${latest.id.slice(0, 8)})`,
          );
        } else {
          await log(
            migrationId,
            `Waiting for Vercel to pick up the new commit...`,
            "warn",
          );
          await new Promise((r) => setTimeout(r, 15_000));
          const retry = await vercel.getLatestDeployment(
            user.vercel_access_token,
            project.name,
          );
          if (retry) {
            currentDeploymentId = retry.id;
            await log(
              migrationId,
              `New deployment detected (${retry.id.slice(0, 8)})`,
            );
          }
        }
      }
    }
  } catch (err: unknown) {
    const message = friendlyError(err);
    await updateMigration(migrationId, {
      status: "failed",
      error_message: message,
    });
    await db("projects").where({ id: project.id }).update({ status: "failed" });
    await log(migrationId, `Build fix loop failed: ${message}`, "error");
  }
}

function extractFilesFromBuildLog(buildLog: string): string[] {
  const files = new Set<string>();
  const patterns = [
    /(?:error|Error|ERROR)\s+(?:in\s+)?[./]*(src\/[^\s:]+)/g,
    /(?:Module not found|Cannot find module).*['"](\.\/[^'"]+|@\/[^'"]+)['"]/g,
    /([^\s]+\.(?:ts|tsx|js|jsx|vue|svelte))[\s:(]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(buildLog)) !== null) {
      let filePath = match[1];
      filePath = filePath.replace(/^[./]+/, "");
      if (
        filePath &&
        !filePath.includes("node_modules") &&
        !filePath.startsWith("http")
      ) {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}
