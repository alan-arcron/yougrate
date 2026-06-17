import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Triangle,
  CreditCard,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Train,
} from "lucide-react";
import { GithubIcon } from "@/components/icons";
import { toast } from "sonner";

export default function Settings() {
  const { profile, signInWithGitHub, refreshProfile } = useAuth();

  const [vercelToken, setVercelToken] = useState("");
  const [savingVercel, setSavingVercel] = useState(false);

  const [githubToken, setGithubToken] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [savingGithub, setSavingGithub] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [reconnectingGithub, setReconnectingGithub] = useState(false);
  const [reconnectingVercel, setReconnectingVercel] = useState(false);
  const [vercelStatus, setVercelStatus] = useState<
    "checking" | "valid" | "invalid" | "unknown" | null
  >(null);

  const [railwayToken, setRailwayToken] = useState("");
  const [savingRailway, setSavingRailway] = useState(false);
  const [reconnectingRailway, setReconnectingRailway] = useState(false);
  const [railwayStatus, setRailwayStatus] = useState<
    "checking" | "valid" | "invalid" | "unknown" | null
  >(null);

  async function checkVercelStatus() {
    if (!profile?.vercel_connected) {
      setVercelStatus(null);
      return;
    }
    setVercelStatus("checking");
    try {
      const res = await api.get<{ connected: boolean; status: string }>(
        "/auth/vercel-status",
      );
      if (!res.connected) {
        setVercelStatus(null);
      } else {
        setVercelStatus(res.status as "valid" | "invalid" | "unknown");
      }
    } catch {
      setVercelStatus("unknown");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkVercelStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.vercel_connected]);

  async function checkRailwayStatus() {
    if (!profile?.railway_connected) {
      setRailwayStatus(null);
      return;
    }
    setRailwayStatus("checking");
    try {
      const res = await api.get<{ connected: boolean; status: string }>(
        "/auth/railway-status",
      );
      if (!res.connected) {
        setRailwayStatus(null);
      } else {
        setRailwayStatus(res.status as "valid" | "invalid" | "unknown");
      }
    } catch {
      setRailwayStatus("unknown");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkRailwayStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.railway_connected]);

  async function saveVercelToken() {
    setSavingVercel(true);
    try {
      await api.post("/auth/vercel-token", { access_token: vercelToken });
      setVercelToken("");
      await refreshProfile();
      await checkVercelStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingVercel(false);
    }
  }

  async function saveRailwayToken() {
    setSavingRailway(true);
    try {
      await api.post("/auth/railway-token", { access_token: railwayToken });
      setRailwayToken("");
      await refreshProfile();
      await checkRailwayStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRailway(false);
    }
  }

  async function saveGithubToken() {
    setSavingGithub(true);
    try {
      await api.post("/auth/github-token", {
        access_token: githubToken,
        username: githubUsername,
      });
      setGithubToken("");
      setGithubUsername("");
      await refreshProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingGithub(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      {/* GitHub Connection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <GithubIcon className="h-5 w-5" />
            GitHub
          </CardTitle>
          <CardDescription>
            Connect your GitHub account to import repos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile?.github_connected && !reconnectingGithub ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  Connected as <strong>{profile.github_username}</strong>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReconnectingGithub(true)}
              >
                <RefreshCw className="mr-1.5 h-3 w-3" />
                Reconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {reconnectingGithub && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Currently connected as{" "}
                    <strong>{profile?.github_username}</strong>. Connect a
                    different account below.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReconnectingGithub(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <Button onClick={signInWithGitHub} variant="outline">
                <GithubIcon className="mr-2 h-4 w-4" />
                {reconnectingGithub
                  ? "Reconnect via OAuth"
                  : "Connect via OAuth"}
              </Button>

              <Separator />

              <p className="text-xs text-muted-foreground">
                Or enter a Personal Access Token manually:
              </p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>GitHub Username</Label>
                  <Input
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="your-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Personal Access Token</Label>
                  <Input
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_..."
                    type="password"
                  />
                </div>
                <Button
                  onClick={async () => {
                    await saveGithubToken();
                    setReconnectingGithub(false);
                  }}
                  disabled={!githubToken || !githubUsername || savingGithub}
                  size="sm"
                >
                  {savingGithub ? "Saving..." : "Save Token"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vercel Connection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Triangle className="h-5 w-5" />
            Vercel
          </CardTitle>
          <CardDescription>
            Connect Vercel to deploy migrated apps
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile?.vercel_connected && !reconnectingVercel ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {vercelStatus === "checking" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Checking token…
                      </span>
                    </>
                  ) : vercelStatus === "invalid" ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400">
                        Token expired or revoked — reconnect to deploy
                      </span>
                    </>
                  ) : vercelStatus === "unknown" ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Couldn&apos;t verify token
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Vercel connected</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {vercelStatus !== "checking" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={checkVercelStatus}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Check
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReconnectingVercel(true)}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    Reconnect
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {reconnectingVercel && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Vercel is currently connected. Paste a new token to replace
                    it.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReconnectingVercel(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                <Label>Vercel API Token</Label>
                <Input
                  value={vercelToken}
                  onChange={(e) => setVercelToken(e.target.value)}
                  placeholder="your-vercel-token"
                  type="password"
                />
                <p className="text-xs text-muted-foreground">
                  Get your token at{" "}
                  <a
                    href="https://vercel.com/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    vercel.com/account/tokens
                  </a>
                  . When creating it, set the{" "}
                  <span className="font-medium text-foreground">Scope</span> to{" "}
                  <span className="font-medium text-foreground">
                    Full Account
                  </span>{" "}
                  (your personal account) &mdash; a token scoped to a specific
                  team/workspace won&apos;t work, since we deploy to your
                  personal account.
                </p>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200 space-y-2">
                  <p className="font-medium">
                    Want auto-deploy when you push to GitHub? (optional)
                  </p>
                  <p>
                    If you connect Vercel to GitHub, Vercel will automatically
                    rebuild your site every time new changes are pushed to the
                    repo. To set this up:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      Connect your GitHub login to Vercel at{" "}
                      <a
                        href="https://vercel.com/account/settings/authentication"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        vercel.com/account/settings/authentication
                      </a>
                      . Use the <span className="font-medium">same</span> GitHub
                      account that owns the migrated repo.
                    </li>
                    <li>
                      Install the Vercel GitHub App at{" "}
                      <a
                        href="https://github.com/apps/vercel"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        github.com/apps/vercel
                      </a>{" "}
                      and choose{" "}
                      <span className="font-medium">All repositories</span> (we
                      often push to a <span className="font-medium">new</span>{" "}
                      repo, so limiting it to one can block the link).
                    </li>
                  </ol>
                  <p>
                    Not using GitHub? No problem &mdash; you can deploy directly
                    from your migration page with one click, no GitHub required.
                  </p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  await saveVercelToken();
                  setReconnectingVercel(false);
                }}
                disabled={!vercelToken || savingVercel}
                size="sm"
              >
                {savingVercel ? "Saving..." : "Save Token"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Railway Connection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Train className="h-5 w-5" />
            Railway
          </CardTitle>
          <CardDescription>
            Connect Railway to deploy apps that need a long-running backend
            server. The code analysis will let you know if it can be hosted on
            Vercel or will need a Railway backend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile?.railway_connected && !reconnectingRailway ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {railwayStatus === "checking" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Checking token…
                      </span>
                    </>
                  ) : railwayStatus === "invalid" ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400">
                        Token rejected — make sure it&apos;s an account token
                        (&ldquo;No workspace&rdquo;), not a workspace/project
                        token
                      </span>
                    </>
                  ) : railwayStatus === "unknown" ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Couldn&apos;t verify token
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Railway connected</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {railwayStatus !== "checking" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={checkRailwayStatus}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Check
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReconnectingRailway(true)}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    Reconnect
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Railway also needs access to your GitHub repos to build them.
                Connect it at{" "}
                <a
                  href="https://github.com/apps/railway-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  the Railway GitHub app
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reconnectingRailway && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Railway is currently connected. Paste a new token to replace
                    it.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReconnectingRailway(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                <Label>Railway API Token</Label>
                <Input
                  value={railwayToken}
                  onChange={(e) => setRailwayToken(e.target.value)}
                  placeholder="your-railway-token"
                  type="password"
                />
                <p className="text-xs text-muted-foreground">
                  Create a token at{" "}
                  <a
                    href="https://railway.com/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    railway.com/account/tokens
                  </a>{" "}
                  and leave the workspace dropdown set to{" "}
                  <strong>&ldquo;No workspace&rdquo;</strong> — a workspace or
                  project-scoped token won&apos;t work. You&apos;ll also need to
                  authorize the{" "}
                  <a
                    href="https://github.com/apps/railway-app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Railway GitHub app
                  </a>{" "}
                  on the repos you want to deploy.
                </p>
              </div>
              <Button
                onClick={async () => {
                  await saveRailwayToken();
                  setReconnectingRailway(false);
                }}
                disabled={!railwayToken || savingRailway}
                size="sm"
              >
                {savingRailway ? "Saving..." : "Save Token"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing
          </CardTitle>
          <CardDescription>Usage-based billing via Stripe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;re charged based on AI token usage per migration. View your
            payment history, receipts, and payment methods in the Stripe portal.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={openingPortal}
            onClick={async () => {
              setOpeningPortal(true);
              try {
                const { portal_url } = await api.post<{ portal_url: string }>(
                  "/billing/portal",
                );
                window.open(portal_url, "_blank");
              } catch {
                toast.error("No billing history yet. Make a payment first.");
              } finally {
                setOpeningPortal(false);
              }
            }}
          >
            <ExternalLink className="mr-2 h-3 w-3" />
            {openingPortal ? "Opening..." : "Payment History & Receipts"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
