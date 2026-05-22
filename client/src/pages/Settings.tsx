import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle2, Triangle, CreditCard, ExternalLink } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import { toast } from "sonner";

export default function Settings() {
  const { profile, signInWithGitHub, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [vercelToken, setVercelToken] = useState("");
  const [savingVercel, setSavingVercel] = useState(false);

  const [githubToken, setGithubToken] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [savingGithub, setSavingGithub] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  async function saveVercelToken() {
    setSavingVercel(true);
    try {
      await api.post("/auth/vercel-token", { access_token: vercelToken });
      setVercelToken("");
      await refreshProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingVercel(false);
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
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {/* GitHub Connection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GithubIcon className="h-5 w-5" />
              GitHub
            </CardTitle>
            <CardDescription>Connect your GitHub account to import repos</CardDescription>
          </CardHeader>
          <CardContent>
            {profile?.github_connected ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Connected as <strong>{profile.github_username}</strong></span>
              </div>
            ) : (
              <div className="space-y-4">
                <Button onClick={signInWithGitHub} variant="outline">
                  <GithubIcon className="mr-2 h-4 w-4" />
                  Connect via OAuth
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
                    onClick={saveGithubToken}
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
            <CardDescription>Connect Vercel to deploy migrated apps</CardDescription>
          </CardHeader>
          <CardContent>
            {profile?.vercel_connected ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Vercel connected</span>
              </div>
            ) : (
              <div className="space-y-3">
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
                    <a href="https://vercel.com/account/tokens" target="_blank" className="underline">
                      vercel.com/account/tokens
                    </a>
                  </p>
                </div>
                <Button
                  onClick={saveVercelToken}
                  disabled={!vercelToken || savingVercel}
                  size="sm"
                >
                  {savingVercel ? "Saving..." : "Save Token"}
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
              You&apos;re charged based on AI token usage per migration. View your payment history,
              receipts, and payment methods in the Stripe portal.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={openingPortal}
              onClick={async () => {
                setOpeningPortal(true);
                try {
                  const { portal_url } = await api.post<{ portal_url: string }>("/billing/portal");
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
