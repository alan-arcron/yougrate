const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

export type TokenStatus = "valid" | "invalid" | "unknown";

interface GraphQLError {
  message: string;
}

/**
 * Execute a GraphQL operation against Railway's public API with an account
 * token. Throws on transport errors or GraphQL errors (message only — never
 * echoes variables, which may contain secrets).
 */
async function railwayGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data?: T; errors?: GraphQLError[] };

  if (!res.ok) {
    throw new Error(`Railway API error (${res.status})`);
  }
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Railway API returned no data");
  }
  return json.data;
}

/**
 * Verify an account token by querying the authenticated `me` field.
 * - "valid":   query succeeds
 * - "invalid": auth-style error (Not Authorized / Unauthorized)
 * - "unknown": any other error (don't claim it's expired)
 */
export async function verifyToken(token: string): Promise<TokenStatus> {
  try {
    await railwayGraphQL<{ me: { id: string } }>(token, `query { me { id } }`);
    return "valid";
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (
      msg.includes("not authorized") ||
      msg.includes("unauthorized") ||
      msg.includes("authentication")
    ) {
      return "invalid";
    }
    return "unknown";
  }
}

/**
 * Best-effort list of GitHub repos (full names like "owner/repo") that the
 * user's Railway-linked GitHub account can deploy from. Returns null if we
 * can't determine it (so callers can proceed rather than block incorrectly).
 */
export async function getAccessibleRepos(
  token: string,
): Promise<string[] | null> {
  try {
    const data = await railwayGraphQL<{
      githubRepos: { fullName: string }[] | null;
    }>(token, `query { githubRepos { fullName } }`);
    if (!data.githubRepos) return null;
    return data.githubRepos.map((r) => r.fullName);
  } catch {
    return null;
  }
}

export interface RailwayProject {
  projectId: string;
  environmentId: string;
}

/**
 * Create a Railway project and return its id plus the id of its default
 * "production" environment (falls back to the first environment).
 */
export async function createProject(
  token: string,
  name: string,
): Promise<RailwayProject> {
  const data = await railwayGraphQL<{
    projectCreate: {
      id: string;
      environments: { edges: { node: { id: string; name: string } }[] };
    };
  }>(
    token,
    `mutation projectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        environments { edges { node { id name } } }
      }
    }`,
    { input: { name } },
  );

  const envs = data.projectCreate.environments.edges.map((e) => e.node);
  const prod = envs.find((e) => e.name === "production") ?? envs[0];
  if (!prod) {
    throw new Error("Railway project created without an environment");
  }
  return { projectId: data.projectCreate.id, environmentId: prod.id };
}

/** Create an empty service in a project; the repo is connected separately. */
export async function createService(
  token: string,
  projectId: string,
  name: string,
): Promise<string> {
  const data = await railwayGraphQL<{ serviceCreate: { id: string } }>(
    token,
    `mutation serviceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id }
    }`,
    { input: { projectId, name } },
  );
  return data.serviceCreate.id;
}

/** Connect a service to a GitHub repo + branch (repo as "owner/name"). */
export async function connectRepo(
  token: string,
  serviceId: string,
  repo: string,
  branch: string,
): Promise<void> {
  await railwayGraphQL(
    token,
    `mutation serviceConnect($id: String!, $input: ServiceConnectInput!) {
      serviceConnect(id: $id, input: $input) { id }
    }`,
    { id: serviceId, input: { repo, branch } },
  );
}

/**
 * Set build/deploy settings (root directory + start command) for a service in
 * an environment. Only sends fields that are provided.
 */
export async function configureService(
  token: string,
  serviceId: string,
  environmentId: string,
  opts: { rootDirectory?: string; startCommand?: string },
): Promise<void> {
  const input: Record<string, string> = {};
  if (opts.rootDirectory) input.rootDirectory = opts.rootDirectory;
  if (opts.startCommand) input.startCommand = opts.startCommand;
  if (Object.keys(input).length === 0) return;

  await railwayGraphQL(
    token,
    `mutation serviceInstanceUpdate(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }`,
    { serviceId, environmentId, input },
  );
}

/**
 * Upsert environment variables on a service. Returns the key names set (never
 * values). Variables are sent one-by-one with upsert semantics.
 */
export async function setVariables(
  token: string,
  ids: { projectId: string; environmentId: string; serviceId: string },
  vars: Record<string, string>,
): Promise<string[]> {
  const entries = Object.entries(vars);
  for (const [name, value] of entries) {
    await railwayGraphQL(
      token,
      `mutation variableUpsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      {
        input: {
          projectId: ids.projectId,
          environmentId: ids.environmentId,
          serviceId: ids.serviceId,
          name,
          value,
        },
      },
    );
  }
  return entries.map(([name]) => name);
}

/** Create a public *.up.railway.app domain for a service. Returns the domain. */
export async function createServiceDomain(
  token: string,
  environmentId: string,
  serviceId: string,
): Promise<string> {
  const data = await railwayGraphQL<{
    serviceDomainCreate: { domain: string };
  }>(
    token,
    `mutation serviceDomainCreate($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { domain }
    }`,
    { input: { environmentId, serviceId } },
  );
  return data.serviceDomainCreate.domain;
}

/** Trigger a deployment for a service instance. Returns the deployment id. */
export async function deployService(
  token: string,
  serviceId: string,
  environmentId: string,
): Promise<string> {
  const data = await railwayGraphQL<{ serviceInstanceDeployV2: string }>(
    token,
    `mutation serviceInstanceDeployV2(
      $serviceId: String!
      $environmentId: String!
    ) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId },
  );
  return data.serviceInstanceDeployV2;
}

export interface DeploymentStatus {
  status: string;
  url: string | null;
}

/** Fetch the latest deployment status for a service in an environment. */
export async function getLatestDeploymentStatus(
  token: string,
  ids: { projectId: string; environmentId: string; serviceId: string },
): Promise<DeploymentStatus | null> {
  try {
    const data = await railwayGraphQL<{
      deployments: {
        edges: { node: { id: string; status: string; staticUrl: string | null } }[];
      };
    }>(
      token,
      `query deployments($input: DeploymentListInput!) {
        deployments(first: 1, input: $input) {
          edges { node { id status staticUrl } }
        }
      }`,
      {
        input: {
          projectId: ids.projectId,
          environmentId: ids.environmentId,
          serviceId: ids.serviceId,
        },
      },
    );
    const node = data.deployments.edges[0]?.node;
    if (!node) return null;
    return { status: node.status, url: node.staticUrl };
  } catch {
    return null;
  }
}
