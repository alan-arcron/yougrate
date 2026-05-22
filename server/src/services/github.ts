import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs/promises";
import os from "os";

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

export async function cloneRepo(
  accessToken: string,
  repoFullName: string,
  branch: string = "main"
): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `yougrate-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const cloneUrl = `https://x-access-token:${accessToken}@github.com/${repoFullName}.git`;
  const git = simpleGit();
  await git.clone(cloneUrl, tmpDir, ["--branch", branch, "--single-branch", "--depth", "1"]);

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

  await fs.rm(path.join(localPath, ".git"), { recursive: true, force: true });
  await git.init();
  await git.addConfig("user.email", "yougrate@arcron.systems");
  await git.addConfig("user.name", "Yougrate");
  await git.checkout(["-b", branch]);
  await git.addRemote("origin", remoteUrl);
  await git.add(".");
  await git.commit(commitMessage);
  await git.push("origin", branch, ["--set-upstream", "--force"]);
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
