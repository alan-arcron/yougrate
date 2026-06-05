import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { redactSecrets } from "../utils/redact";

/** Re-throw a git error with any embedded token/credentials stripped. */
function scrubGitError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  throw new Error(redactSecrets(msg));
}

export function getOctokit(accessToken: string): InstanceType<typeof Octokit> {
  return new Octokit({
    auth: accessToken,
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
}

export async function listRepos(accessToken: string) {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
    type: "owner",
  });
  return data.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    name: r.name,
    html_url: r.html_url,
    default_branch: r.default_branch,
    private: r.private,
    language: r.language,
    updated_at: r.updated_at,
  }));
}

export interface RepoInfo {
  full_name: string;
  default_branch: string;
  private: boolean;
  permissions: { pull: boolean; push: boolean; admin: boolean };
}

/**
 * Fetch repo metadata using the caller's token. Returns null if the repo does
 * not exist or the token cannot see it (404). `permissions` reflects what the
 * token holder can do (push/admin), which we use to gate write operations.
 */
export async function getRepoInfo(
  accessToken: string,
  repoFullName: string,
): Promise<RepoInfo | null> {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) return null;
  const octokit = getOctokit(accessToken);
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    return {
      full_name: data.full_name,
      default_branch: data.default_branch,
      private: data.private,
      permissions: {
        pull: data.permissions?.pull ?? false,
        push: data.permissions?.push ?? false,
        admin: data.permissions?.admin ?? false,
      },
    };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function cloneRepo(
  accessToken: string,
  repoFullName: string,
  branch: string = "main"
): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `yougrate-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const cloneUrl = `https://x-access-token:${accessToken}@github.com/${repoFullName}.git`;
  const git = simpleGit();
  try {
    await git.clone(cloneUrl, tmpDir, ["--branch", branch, "--single-branch", "--depth", "1"]);
  } catch (err) {
    scrubGitError(err);
  }

  return tmpDir;
}

export async function createNewRepo(
  accessToken: string,
  name: string,
  isPrivate: boolean = true
): Promise<{ full_name: string; html_url: string; clone_url: string }> {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name,
    private: isPrivate,
    auto_init: false,
  });
  return {
    full_name: data.full_name,
    html_url: data.html_url,
    clone_url: data.clone_url,
  };
}

export async function pushToRepo(
  accessToken: string,
  localPath: string,
  repoFullName: string,
  branch: string,
  commitMessage: string
): Promise<void> {
  const remoteUrl = `https://x-access-token:${accessToken}@github.com/${repoFullName}.git`;
  const git = simpleGit(localPath);

  try {
    await fs.rm(path.join(localPath, ".git"), { recursive: true, force: true });
    await git.init();
    await git.addConfig("user.email", "noreply@github.com");
    await git.addConfig("user.name", "Yougrate");
    await git.addConfig("http.version", "HTTP/1.1");
    await git.addConfig("http.postBuffer", "524288000");
    await git.checkout(["-b", branch]);
    await git.addRemote("origin", remoteUrl);
    await git.add(".");
    await git.commit(commitMessage);
    await git.push("origin", branch, ["--set-upstream", "--force"]);
  } catch (err) {
    scrubGitError(err);
  }
}

export async function getRepoFiles(localPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(localPath, fullPath);

      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(relPath);
      }
    }
  }

  await walk(localPath);
  return files;
}
