const VERCEL_API = "https://api.vercel.com";

interface VercelProject {
  id: string;
  name: string;
  link?: { type: string; repo: string; repoId: number };
}

export async function vercelFetch(token: string, path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${VERCEL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

export type TokenStatus = "valid" | "invalid" | "unknown";

/**
 * Check whether a Vercel token is still valid (not expired/revoked) by hitting
 * the authenticated /v2/user endpoint.
 * - "valid":   2xx response
 * - "invalid": 401/403 (expired or revoked token)
 * - "unknown": any other status or a network error (don't claim it's expired)
 */
export async function verifyToken(token: string): Promise<TokenStatus> {
  try {
    const res = await vercelFetch(token, "/v2/user");
    if (res.ok) return "valid";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function createProject(
  token: string,
  name: string,
  repoFullName: string,
  envVars: Record<string, string> = {},
  framework?: string | null,
): Promise<VercelProject> {
  const [owner, repo] = repoFullName.split("/");

  const body: Record<string, unknown> = {
    name,
    gitRepository: {
      type: "github",
      repo: `${owner}/${repo}`,
    },
    environmentVariables: Object.entries(envVars).map(([key, value]) => ({
      key,
      value,
      target: ["production", "preview"],
      type: "encrypted",
    })),
  };

  if (framework) {
    body.framework = framework;
  }

  const res = await vercelFetch(token, "/v10/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json() as Record<string, unknown>;
    throw new Error(`Vercel API error: ${JSON.stringify(err)}`);
  }

  return await res.json() as VercelProject;
}

export async function triggerDeployment(
  token: string,
  projectName: string,
  ref: string = "main",
  repoId?: number
): Promise<{ id: string; url: string; readyState: string }> {
  const body: Record<string, unknown> = {
    name: projectName,
    target: "production",
  };

  if (repoId) {
    body.gitSource = { ref, type: "github", repoId };
  } else {
    body.gitSource = { ref, type: "github" };
  }

  const res = await vercelFetch(token, "/v13/deployments?skipAutoDetectionConfirmation=1", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json() as Record<string, unknown>;
    throw new Error(`Vercel deploy error: ${JSON.stringify(err)}`);
  }

  return await res.json() as { id: string; url: string; readyState: string };
}

export async function getDeploymentStatus(
  token: string,
  deploymentId: string
): Promise<{ readyState: string; url: string | null }> {
  const res = await vercelFetch(token, `/v13/deployments/${deploymentId}`);
  if (!res.ok) throw new Error("Failed to get deployment status");
  const data = await res.json() as { readyState: string; url: string | null };
  return { readyState: data.readyState, url: data.url };
}

export async function getDeploymentEvents(
  token: string,
  deploymentId: string
): Promise<string> {
  const res = await vercelFetch(token, `/v3/deployments/${deploymentId}/events`);
  if (!res.ok) throw new Error("Failed to get deployment events");
  const events = await res.json() as { text?: string; payload?: { text?: string } }[];

  const logLines = events
    .map((e) => e.text || e.payload?.text || "")
    .filter(Boolean);

  return logLines.join("\n");
}

export async function waitForDeployment(
  token: string,
  deploymentId: string,
  timeoutMs: number = 300_000,
): Promise<{ readyState: string; url: string | null }> {
  const start = Date.now();
  const pollInterval = 10_000;

  while (Date.now() - start < timeoutMs) {
    const status = await getDeploymentStatus(token, deploymentId);
    if (status.readyState === "READY" || status.readyState === "ERROR" || status.readyState === "CANCELED") {
      return status;
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("Deployment timed out after 5 minutes");
}

export async function getProject(
  token: string,
  name: string,
): Promise<VercelProject | null> {
  const res = await vercelFetch(token, `/v9/projects/${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return await res.json() as VercelProject;
}

/**
 * Create or update environment variables on a Vercel project in a single batch.
 *
 * Uses `?upsert=true` so existing keys are overwritten instead of erroring with
 * ENV_CONFLICT. Values are stored as type "sensitive" — Vercel will not echo
 * them back via the API/dashboard after creation, matching our "never expose
 * secrets again" posture. Targets all environments so the values apply to
 * production, preview, and development builds.
 *
 * Returns the list of keys that were submitted (names only — never values).
 */
export async function upsertEnvVars(
  token: string,
  projectIdOrName: string,
  vars: Record<string, string>,
): Promise<string[]> {
  const entries = Object.entries(vars);
  if (entries.length === 0) return [];

  const body = entries.map(([key, value]) => ({
    key,
    value,
    type: "sensitive",
    target: ["production", "preview", "development"],
  }));

  const res = await vercelFetch(
    token,
    `/v10/projects/${encodeURIComponent(projectIdOrName)}/env?upsert=true`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = (await res.json()) as Record<string, unknown>;
    // Note: do not include `body` (contains secret values) in the error.
    throw new Error(`Vercel env API error: ${JSON.stringify(err)}`);
  }

  return entries.map(([key]) => key);
}

export async function getLatestDeployment(
  token: string,
  projectName: string,
): Promise<{ id: string; readyState: string; url: string | null } | null> {
  const res = await vercelFetch(token, `/v6/deployments?projectId=${projectName}&limit=1&target=production`);
  if (!res.ok) return null;
  const data = await res.json() as { deployments: { uid: string; readyState: string; url: string | null }[] };
  const d = data.deployments?.[0];
  if (!d) return null;
  return { id: d.uid, readyState: d.readyState, url: d.url };
}
