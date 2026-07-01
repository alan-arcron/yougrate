import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { api, apiDownload } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  DollarSign,
  Activity,
  MessageSquare,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  Cpu,
  TrendingUp,
  Eye,
  RefreshCw,
  Download,
  Trash2,
  Pencil,
  Copy,
  Check,
} from "lucide-react";

interface Stats {
  total_users: number;
  total_migrations: number;
  open_tickets: number;
  pending_reviews: number;
  total_revenue_cents: number;
  anthropic_cost_cents: number;
  anthropic_margin_cents: number;
  anthropic_tokens: {
    total_input: number;
    total_output: number;
    analysis_input: number;
    analysis_output: number;
  };
}

interface PendingReview {
  id: string;
  project_id: string;
  status: string;
  detected_platform: string | null;
  files_to_migrate: number;
  files_migrated: number;
  output_repo_url: string | null;
  output_branch: string | null;
  completed_at: string | null;
  review_notes: string | null;
  review_artifact_name: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  project_name: string;
  user_email?: string;
}

interface CostRow {
  id: string;
  project_id: string;
  status: string;
  detected_platform: string | null;
  project_name: string;
  user_email: string;
  files_to_migrate: number;
  files_migrated: number;
  actual_input_tokens: number;
  actual_output_tokens: number;
  actual_cost_cents: number;
  estimated_cost_cents: number;
  raw_cost_cents: number;
  revenue_cents: number;
  margin_cents: number;
  payment_status: string;
  created_at: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  github_username: string | null;
  github_connected: boolean;
  vercel_connected: boolean;
  free_analyses_used: number;
  free_analyses_limit: number;
  created_at: string;
}

interface Ticket {
  id: string;
  user_email: string;
  type: string;
  subject: string;
  description: string;
  image_urls: string[];
  status: string;
  admin_notes: string | null;
  created_at: string;
}

interface AdminProject {
  id: string;
  name: string;
  github_repo_full_name: string;
  status: string;
  created_at: string;
}

interface UserMigration {
  id: string;
  status: string;
  detected_platform: string | null;
  project_id: string;
  project_name: string;
  github_repo_full_name: string;
  files_to_migrate: number;
  files_migrated: number;
  actual_cost_cents: number;
  estimated_cost_cents: number;
  revenue_cents: number;
  retry_count: number;
  created_at: string;
}

interface MigrationLogEntry {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
}

interface MigrationFileRow {
  id: string;
  file_path: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
}

interface MigrationDetail {
  id: string;
  status: string;
  detected_platform: string | null;
  project_name: string;
  github_repo_full_name: string;
  files_to_migrate: number;
  files_migrated: number;
  analysis_input_tokens: number;
  analysis_output_tokens: number;
  analysis_cost_cents: number;
  migration_cost_cents: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_cents: number;
  actual_input_tokens: number;
  actual_output_tokens: number;
  actual_cost_cents: number;
  raw_cost_cents: number;
  revenue_cents: number;
  margin_cents: number;
  customer_price: {
    estimated: boolean;
    base_fee_cents: number;
    token_billed_cents: number;
    addon_code_review_cents: number;
    total_cents: number;
    charged_cents: number;
  };
  retry_count: number;
  error_message: string | null;
  output_repo_url: string | null;
  output_branch: string | null;
  migration_log: MigrationLogEntry[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  files: MigrationFileRow[];
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500",
  in_progress: "bg-amber-500",
  resolved: "bg-green-500",
  closed: "bg-zinc-500",
};

// Small inline "copy to clipboard" control for an email address. Uses a span
// (not a button) with stopPropagation so it can live inside clickable rows
// without nesting interactive elements.
function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(email).then(
      () => {
        setCopied(true);
        toast.success("Email copied");
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Couldn't copy email"),
    );
  };

  return (
    <span
      role="button"
      tabIndex={0}
      title="Copy email"
      aria-label="Copy email"
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") copy(e);
      }}
      className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

export default function Admin() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState("open");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userMigrations, setUserMigrations] = useState<UserMigration[]>([]);
  const [userProjects, setUserProjects] = useState<AdminProject[]>([]);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [resettingUser, setResettingUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [deletingMigration, setDeletingMigration] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [editingTicket, setEditingTicket] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [costBreakdown, setCostBreakdown] = useState<CostRow[]>([]);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [expandedMigration, setExpandedMigration] = useState<string | null>(null);
  const [migrationDetail, setMigrationDetail] = useState<MigrationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [updatingReview, setUpdatingReview] = useState<string | null>(null);
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewFiles, setReviewFiles] = useState<Record<string, File | null>>({});
  const [deliveringReview, setDeliveringReview] = useState<string | null>(null);
  const [revising, setRevising] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!profile.is_admin && !profile.is_reviewer) {
      navigate("/dashboard");
      return;
    }
    // Reviewers only get the review queue — no admin-only stats/users.
    if (!profile.is_admin) {
      loadReviews();
      return;
    }
    api.get<Stats>("/admin/stats").then(setStats).catch(console.error);
    loadUsers();
  }, [profile, authLoading]);

  function loadUsers(search?: string) {
    setLoadingUsers(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    api
      .get<{ users: AdminUser[] }>(`/admin/users${params}`)
      .then((d) => setUsers(d.users))
      .catch(console.error)
      .finally(() => setLoadingUsers(false));
  }

  function loadCosts() {
    setLoadingCosts(true);
    api
      .get<CostRow[]>("/admin/cost-breakdown")
      .then(setCostBreakdown)
      .catch(console.error)
      .finally(() => setLoadingCosts(false));
  }

  async function toggleMigrationExpand(migrationId: string) {
    if (expandedMigration === migrationId) {
      setExpandedMigration(null);
      setMigrationDetail(null);
      return;
    }
    setExpandedMigration(migrationId);
    setLoadingDetail(true);
    try {
      const detail = await api.get<MigrationDetail>(`/admin/migrations/${migrationId}`);
      setMigrationDetail(detail);
    } catch {
      setMigrationDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function downloadCode(migrationId: string) {
    setDownloadingCode(migrationId);
    try {
      await apiDownload(`/admin/migrations/${migrationId}/download`, `${migrationId}.zip`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download code");
    } finally {
      setDownloadingCode(null);
    }
  }

  async function deliverReview(id: string) {
    setDeliveringReview(id);
    try {
      let artifact_key: string | undefined;
      let artifact_name: string | undefined;
      const file = reviewFiles[id];
      if (file) {
        const contentType = file.type || "application/zip";
        const { uploadUrl, key } = await api.post<{ uploadUrl: string; key: string }>(
          `/admin/migrations/${id}/review-upload-url`,
          { filename: file.name, contentType },
        );
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!put.ok) throw new Error("Upload to storage failed");
        artifact_key = key;
        artifact_name = file.name;
      }
      await api.patch(`/admin/migrations/${id}/review`, {
        notes: reviewNotes[id] ?? "",
        artifact_key,
        artifact_name,
      });
      toast.success(
        revising[id]
          ? "Updated review delivered to the customer"
          : "Review delivered to the customer",
      );
      setReviewFiles((prev) => ({ ...prev, [id]: null }));
      setRevising((prev) => ({ ...prev, [id]: false }));
      loadReviews();
      api.get<Stats>("/admin/stats").then(setStats).catch(console.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deliver review");
    } finally {
      setDeliveringReview(null);
    }
  }

  function loadReviews() {
    setLoadingReviews(true);
    api
      .get<PendingReview[]>("/admin/pending-reviews")
      .then(setPendingReviews)
      .catch(console.error)
      .finally(() => setLoadingReviews(false));
  }

  async function updateReviewStatus(migrationId: string, status: "reviewing" | "reviewed") {
    setUpdatingReview(migrationId);
    try {
      await api.patch(`/admin/migrations/${migrationId}/review-status`, { status });
      loadReviews();
      api.get<Stats>("/admin/stats").then(setStats).catch(console.error);
      toast.success(status === "reviewed" ? "Migration marked as reviewed" : "Review started");
    } catch {
      toast.error("Failed to update review status");
    } finally {
      setUpdatingReview(null);
    }
  }

  function startRevision(r: PendingReview) {
    setReviewNotes((prev) => ({
      ...prev,
      [r.id]: prev[r.id] ?? r.review_notes ?? "",
    }));
    setRevising((prev) => ({ ...prev, [r.id]: true }));
  }

  async function resetAnalyses(userId: string) {
    if (
      !window.confirm(
        "Reset this user's free analysis usage back to 0? They'll get their full free analyses again.",
      )
    ) {
      return;
    }
    setResettingUser(userId);
    try {
      const updated = await api.post<{
        id: string;
        free_analyses_used: number;
        free_analyses_limit: number;
      }>(`/admin/users/${userId}/reset-analyses`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                free_analyses_used: updated.free_analyses_used,
                free_analyses_limit: updated.free_analyses_limit,
              }
            : u,
        ),
      );
      toast.success("Analysis count reset");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setResettingUser(null);
    }
  }

  async function deleteUser(u: AdminUser) {
    if (
      !window.confirm(
        `Permanently delete ${u.email}?\n\nThis removes the user and ALL their data — projects, migrations, files, and billing records — plus their S3 workspaces and login. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingUser(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      if (expandedUser === u.id) setExpandedUser(null);
      api.get<Stats>("/admin/stats").then(setStats).catch(console.error);
      toast.success("User and all their data deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeletingUser(null);
    }
  }

  async function deleteMigration(m: UserMigration) {
    if (
      !window.confirm(
        `Permanently delete the "${m.project_name}" migration?\n\nThis removes the migration, its files, and its S3 workspace (including any reviewed code). Billing records are kept. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingMigration(m.id);
    try {
      await api.delete(`/admin/migrations/${m.id}`);
      setUserMigrations((prev) => prev.filter((x) => x.id !== m.id));
      if (expandedMigration === m.id) setExpandedMigration(null);
      api.get<Stats>("/admin/stats").then(setStats).catch(console.error);
      toast.success("Migration deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete migration");
    } finally {
      setDeletingMigration(null);
    }
  }

  function loadTickets(status?: string) {
    setLoadingTickets(true);
    const params = status && status !== "all" ? `?status=${status}` : "";
    api
      .get<{ tickets: Ticket[] }>(`/admin/tickets${params}`)
      .then((d) => setTickets(d.tickets))
      .catch(console.error)
      .finally(() => setLoadingTickets(false));
  }

  async function toggleUserExpand(userId: string) {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    try {
      const [migrations, projects] = await Promise.all([
        api.get<UserMigration[]>(`/admin/users/${userId}/migrations`),
        api.get<AdminProject[]>(`/admin/users/${userId}/projects`),
      ]);
      setUserMigrations(migrations);
      setUserProjects(projects);
    } catch {
      setUserMigrations([]);
      setUserProjects([]);
    }
  }

  async function deleteProject(p: AdminProject) {
    if (
      !window.confirm(
        `Permanently delete the "${p.name}" project?\n\nThis removes the project and ALL its migrations, files, and S3 workspaces. Billing records are kept. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingProject(p.id);
    try {
      await api.delete(`/projects/${p.id}`);
      setUserProjects((prev) => prev.filter((x) => x.id !== p.id));
      setUserMigrations((prev) => prev.filter((m) => m.project_id !== p.id));
      api.get<Stats>("/admin/stats").then(setStats).catch(console.error);
      toast.success("Project and all its migrations deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingProject(null);
    }
  }

  async function updateTicket(
    ticketId: string,
    updates: { status?: string; admin_notes?: string },
  ) {
    try {
      const updated = await api.patch<Ticket>(
        `/admin/tickets/${ticketId}`,
        updates,
      );
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));
      setEditingTicket(null);
      toast.success("Ticket updated");
    } catch {
      toast.error("Failed to update ticket");
    }
  }

  if (authLoading || !profile) return null;
  if (!profile.is_admin && !profile.is_reviewer) return null;

  const reviewerOnly = !profile.is_admin;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">
        {reviewerOnly ? "Review Queue" : "Admin Dashboard"}
      </h1>

      {/* Stats */}
      {!reviewerOnly && stats && (
        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{stats.total_users}</p>
                    <p className="text-xs text-muted-foreground">Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{stats.total_migrations}</p>
                    <p className="text-xs text-muted-foreground">Migrations</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">
                      ${(stats.total_revenue_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.pending_reviews}</p>
                    <p className="text-xs text-muted-foreground">Pending Reviews</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{stats.open_tickets}</p>
                    <p className="text-xs text-muted-foreground">Open Tickets</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      ${(stats.anthropic_cost_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">API Cost</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className={`h-5 w-5 ${stats.anthropic_margin_cents >= 0 ? "text-green-500" : "text-red-500"}`} />
                  <div>
                    <p className={`text-2xl font-bold ${stats.anthropic_margin_cents >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ${(stats.anthropic_margin_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Realized Margin
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-2xl font-bold">
                    {((stats.anthropic_tokens.total_input + stats.anthropic_tokens.total_output) / 1_000_000).toFixed(2)}M
                  </p>
                  <p className="text-xs text-muted-foreground">Migration Tokens</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-2xl font-bold">
                    {((stats.anthropic_tokens.analysis_input + stats.anthropic_tokens.analysis_output) / 1_000_000).toFixed(2)}M
                  </p>
                  <p className="text-xs text-muted-foreground">Analysis Tokens</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Tabs
        defaultValue={reviewerOnly ? "reviews" : "users"}
        onValueChange={(v) => {
          if (v === "users") loadUsers();
          if (v === "tickets") loadTickets(ticketFilter);
          if (v === "costs") loadCosts();
          if (v === "reviews") loadReviews();
        }}
      >
        {!reviewerOnly && (
          <TabsList className="mb-6">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="costs">Anthropic Costs</TabsTrigger>
            <TabsTrigger value="reviews" className="relative">
              Reviews
              {stats && stats.pending_reviews > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                  {stats.pending_reviews}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tickets">Support Tickets</TabsTrigger>
          </TabsList>
        )}

        {/* Users tab */}
        {!reviewerOnly && (
        <>
        <TabsContent value="users">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, name, or GitHub username..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadUsers(userSearch)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => loadUsers(userSearch)}>Search</Button>
          </div>

          {loadingUsers ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <Card key={u.id}>
                  <CardContent className="py-3">
                    <button
                      onClick={() => toggleUserExpand(u.id)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {u.email}
                            </p>
                            <CopyEmailButton email={u.email} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {u.name || "No name"}{" "}
                            {u.github_username && `(@${u.github_username})`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {u.github_connected && (
                          <Badge variant="outline" className="text-xs">
                            GH
                          </Badge>
                        )}
                        {u.vercel_connected && (
                          <Badge variant="outline" className="text-xs">
                            VC
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </span>
                        {expandedUser === u.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {expandedUser === u.id && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Free analyses
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {Math.max(
                                  0,
                                  u.free_analyses_limit - u.free_analyses_used,
                                )}{" "}
                                left
                              </p>
                              <span className="text-xs text-muted-foreground">
                                ({u.free_analyses_used} used of{" "}
                                {u.free_analyses_limit})
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                disabled={resettingUser === u.id}
                                onClick={() => resetAnalyses(u.id)}
                              >
                                {resettingUser === u.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                )}
                                Reset
                              </Button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              User ID
                            </p>
                            <p className="font-mono text-xs truncate">{u.id}</p>
                          </div>
                        </div>
                        <Separator />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Projects &amp; migrations
                        </p>
                        {userProjects.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No projects
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {userProjects.map((p) => {
                              const projMigrations = userMigrations.filter(
                                (m) => m.project_id === p.id,
                              );
                              return (
                              <div key={p.id} className="rounded-lg border">
                                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium truncate">
                                      {p.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {p.github_repo_full_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] text-muted-foreground">
                                      {projMigrations.length}{" "}
                                      {projMigrations.length === 1
                                        ? "migration"
                                        : "migrations"}
                                    </span>
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {p.status}
                                    </Badge>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      disabled={deletingProject === p.id}
                                      onClick={() => deleteProject(p)}
                                    >
                                      {deletingProject === p.id ? (
                                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="mr-1.5 h-3 w-3" />
                                      )}
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                                {projMigrations.length === 0 ? (
                                  <p className="text-xs text-muted-foreground px-3 py-3">
                                    No migrations yet
                                  </p>
                                ) : (
                                  <div className="space-y-2 p-2">
                                    {projMigrations.map((m) => (
                              <div key={m.id} className="rounded border">
                                <button
                                  onClick={() => toggleMigrationExpand(m.id)}
                                  className="w-full flex items-center justify-between text-xs px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-medium">
                                      {new Date(m.created_at).toLocaleDateString()}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {new Date(m.created_at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground/70">
                                      {m.id.slice(0, 8)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {m.revenue_cents > 0 && (
                                      <span className="font-mono text-muted-foreground">
                                        ${(m.revenue_cents / 100).toFixed(2)}
                                      </span>
                                    )}
                                    {m.retry_count > 0 && (
                                      <Badge variant="outline" className="text-xs text-amber-600">
                                        {m.retry_count} retry
                                      </Badge>
                                    )}
                                    {m.detected_platform && (
                                      <Badge variant="outline" className="text-xs capitalize">
                                        {m.detected_platform}
                                      </Badge>
                                    )}
                                    <Badge
                                      variant={m.status === "completed" ? "default" : "secondary"}
                                      className="text-xs capitalize"
                                    >
                                      {m.status}
                                    </Badge>
                                    {expandedMigration === m.id ? (
                                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    )}
                                  </div>
                                </button>

                                {expandedMigration === m.id && (
                                  <div className="border-t px-3 py-3 space-y-4">
                                    {loadingDetail ? (
                                      <div className="flex justify-center py-4">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      </div>
                                    ) : migrationDetail ? (
                                      <>
                                        {/* Cost & pricing */}
                                        {(() => {
                                          const cp =
                                            migrationDetail.customer_price;
                                          const estimated = cp?.estimated;
                                          const analysisCost =
                                            migrationDetail.analysis_cost_cents;
                                          const migrationCost =
                                            migrationDetail.migration_cost_cents;
                                          const totalSpend =
                                            migrationDetail.raw_cost_cents;
                                          const baseFee = cp?.base_fee_cents || 0;
                                          const markupFee =
                                            cp?.token_billed_cents || 0;
                                          const codeReview =
                                            cp?.addon_code_review_cents || 0;
                                          // Only count money actually collected
                                          // via Stripe. We don't show margin on
                                          // unrealized (quoted-but-unpaid) revenue.
                                          const paidAmount = cp?.charged_cents || 0;
                                          const paid = paidAmount > 0;
                                          const quote = estimated
                                            ? cp.total_cents
                                            : 0;
                                          const margin = paidAmount - totalSpend;
                                          const marginPct =
                                            paid && paidAmount > 0
                                              ? (margin / paidAmount) * 100
                                              : null;
                                          return (
                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                                Cost &amp; Pricing
                                              </p>
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {/* Total token spend (our Anthropic cost) */}
                                                <div className="rounded-lg border bg-muted/40 p-3">
                                                  <p className="text-xs text-muted-foreground">
                                                    Total token spend
                                                  </p>
                                                  <p className="text-lg font-mono font-bold text-orange-600">
                                                    $
                                                    {(totalSpend / 100).toFixed(
                                                      2,
                                                    )}
                                                  </p>
                                                  <div className="mt-2 space-y-1 text-xs font-mono text-muted-foreground">
                                                    <div className="flex justify-between gap-3">
                                                      <span>Analysis tokens</span>
                                                      <span>
                                                        $
                                                        {(
                                                          analysisCost / 100
                                                        ).toFixed(2)}
                                                      </span>
                                                    </div>
                                                    <div className="flex justify-between gap-3">
                                                      <span>
                                                        Migration tokens
                                                      </span>
                                                      <span>
                                                        $
                                                        {(
                                                          migrationCost / 100
                                                        ).toFixed(2)}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>

                                                {/* What the customer paid (or was quoted, if unpaid) */}
                                                <div
                                                  className={`rounded-lg border p-3 ${paid ? "border-primary/30 bg-primary/5" : "bg-muted/40"}`}
                                                >
                                                  <p className="text-xs text-muted-foreground">
                                                    {paid
                                                      ? "Total customer paid"
                                                      : "Quoted estimate (unpaid)"}
                                                  </p>
                                                  {estimated ? (
                                                    <>
                                                      <p
                                                        className={`text-lg font-mono font-bold ${paid ? "text-primary" : "text-muted-foreground"}`}
                                                      >
                                                        $
                                                        {(
                                                          (paid
                                                            ? paidAmount
                                                            : quote) / 100
                                                        ).toFixed(2)}
                                                      </p>
                                                      <div className="mt-2 space-y-1 text-xs font-mono text-muted-foreground">
                                                        <div className="flex justify-between gap-3">
                                                          <span>Base fee</span>
                                                          <span>
                                                            $
                                                            {(
                                                              baseFee / 100
                                                            ).toFixed(2)}
                                                          </span>
                                                        </div>
                                                        <div className="flex justify-between gap-3">
                                                          <span>
                                                            Token markup fee
                                                          </span>
                                                          <span>
                                                            $
                                                            {(
                                                              markupFee / 100
                                                            ).toFixed(2)}
                                                          </span>
                                                        </div>
                                                        {codeReview > 0 && (
                                                          <div className="flex justify-between gap-3">
                                                            <span>
                                                              Code review
                                                            </span>
                                                            <span>
                                                              $
                                                              {(
                                                                codeReview / 100
                                                              ).toFixed(2)}
                                                            </span>
                                                          </div>
                                                        )}
                                                      </div>
                                                    </>
                                                  ) : (
                                                    <Badge
                                                      variant="secondary"
                                                      className="text-[10px] mt-1"
                                                    >
                                                      Not estimated yet
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>

                                              {paid && (
                                                <div className="flex items-center gap-6 mt-3">
                                                  <div>
                                                    <span className="text-xs text-muted-foreground">
                                                      Margin{" "}
                                                    </span>
                                                    <span
                                                      className={`text-sm font-mono font-medium ${margin >= 0 ? "text-green-600" : "text-red-600"}`}
                                                    >
                                                      $
                                                      {(margin / 100).toFixed(2)}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-xs text-muted-foreground">
                                                      Margin %{" "}
                                                    </span>
                                                    <span
                                                      className={`text-sm font-mono font-medium ${marginPct === null ? "text-muted-foreground" : marginPct >= 0 ? "text-green-600" : "text-red-600"}`}
                                                    >
                                                      {marginPct === null
                                                        ? "—"
                                                        : `${marginPct.toFixed(0)}%`}
                                                    </span>
                                                  </div>
                                                </div>
                                              )}

                                              <p className="text-[11px] text-muted-foreground mt-1.5">
                                                {!estimated
                                                  ? "Pricing appears once analysis finishes and produces a token estimate."
                                                  : paid
                                                    ? `Paid $${(paidAmount / 100).toFixed(2)} via Stripe.`
                                                    : "Quoted estimate — not paid yet, so no margin is counted."}
                                              </p>
                                            </div>
                                          );
                                        })()}

                                        {/* Token breakdown */}
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Token Usage</p>
                                          <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Estimated</p>
                                              <p className="text-xs font-mono">
                                                {((migrationDetail.estimated_input_tokens) / 1000).toFixed(0)}k in / {((migrationDetail.estimated_output_tokens) / 1000).toFixed(0)}k out
                                              </p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Actual</p>
                                              <p className="text-xs font-mono">
                                                {((migrationDetail.actual_input_tokens) / 1000).toFixed(0)}k in / {((migrationDetail.actual_output_tokens) / 1000).toFixed(0)}k out
                                              </p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Estimate Accuracy</p>
                                              <p className="text-xs font-mono">
                                                {migrationDetail.actual_input_tokens + migrationDetail.actual_output_tokens === 0
                                                  ? "Not run yet"
                                                  : migrationDetail.estimated_input_tokens + migrationDetail.estimated_output_tokens > 0
                                                    ? `${(((migrationDetail.actual_input_tokens + migrationDetail.actual_output_tokens) / (migrationDetail.estimated_input_tokens + migrationDetail.estimated_output_tokens)) * 100).toFixed(0)}% of estimate`
                                                    : "N/A"}
                                              </p>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Timing + operational */}
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Details</p>
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                            <div>
                                              <span className="text-muted-foreground">Files: </span>
                                              <span className="font-medium">{migrationDetail.files_migrated}/{migrationDetail.files_to_migrate}</span>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground">Retries: </span>
                                              <span className={`font-medium ${migrationDetail.retry_count > 0 ? "text-amber-600" : ""}`}>
                                                {migrationDetail.retry_count}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground">Started: </span>
                                              <span className="font-medium">
                                                {migrationDetail.started_at ? new Date(migrationDetail.started_at).toLocaleString() : "—"}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground">Duration: </span>
                                              <span className="font-medium">
                                                {migrationDetail.started_at && migrationDetail.completed_at
                                                  ? `${Math.round((new Date(migrationDetail.completed_at).getTime() - new Date(migrationDetail.started_at).getTime()) / 60000)}m`
                                                  : "—"}
                                              </span>
                                            </div>
                                          </div>
                                          {migrationDetail.output_repo_url && (
                                            <p className="text-xs mt-2">
                                              <span className="text-muted-foreground">Output: </span>
                                              <a href={migrationDetail.output_repo_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                                {migrationDetail.output_repo_url.replace("https://github.com/", "")}
                                              </a>
                                              {migrationDetail.output_branch && (
                                                <span className="text-muted-foreground"> ({migrationDetail.output_branch})</span>
                                              )}
                                              <span className="text-muted-foreground"> · private to the customer (not accessible to you)</span>
                                            </p>
                                          )}
                                          <div className="mt-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-7 text-xs"
                                              disabled={downloadingCode === expandedMigration}
                                              onClick={() => downloadCode(expandedMigration!)}
                                            >
                                              {downloadingCode === expandedMigration ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              ) : (
                                                <Download className="h-3 w-3 mr-1" />
                                              )}
                                              Download code (.zip)
                                            </Button>
                                            <p className="text-[11px] text-muted-foreground mt-1">
                                              Full migrated output rebuilt from S3 (secrets excluded) — what the customer received.
                                            </p>
                                          </div>
                                          {migrationDetail.error_message && (
                                            <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded p-2">
                                              <p className="text-xs text-red-600 whitespace-pre-wrap">{migrationDetail.error_message}</p>
                                            </div>
                                          )}
                                        </div>

                                        {/* File table */}
                                        {migrationDetail.files.length > 0 && (
                                          <div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                              Files ({migrationDetail.files.length})
                                            </p>
                                            <div className="rounded border max-h-48 overflow-y-auto">
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="border-b bg-muted/50 sticky top-0">
                                                    <th className="px-2 py-1 text-left font-medium">Path</th>
                                                    <th className="px-2 py-1 text-left font-medium">Status</th>
                                                    <th className="px-2 py-1 text-right font-medium">Tokens</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {migrationDetail.files.map((f) => (
                                                    <tr key={f.id} className="border-b last:border-0">
                                                      <td className="px-2 py-1 font-mono truncate max-w-[300px]">{f.file_path}</td>
                                                      <td className="px-2 py-1">
                                                        <Badge
                                                          variant={f.status === "completed" ? "default" : f.status === "failed" ? "destructive" : "secondary"}
                                                          className="text-[10px] capitalize"
                                                        >
                                                          {f.status}
                                                        </Badge>
                                                      </td>
                                                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                                                        {f.input_tokens + f.output_tokens > 0
                                                          ? `${((f.input_tokens + f.output_tokens) / 1000).toFixed(1)}k`
                                                          : "—"}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}

                                        {/* Event log */}
                                        {migrationDetail.migration_log && migrationDetail.migration_log.length > 0 && (
                                          <div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                              Event Log ({migrationDetail.migration_log.length})
                                            </p>
                                            <div className="rounded border max-h-48 overflow-y-auto bg-muted/30 p-2 space-y-1">
                                              {migrationDetail.migration_log.map((entry, i) => (
                                                <div key={i} className="flex gap-2 text-[11px] leading-relaxed">
                                                  <span className="text-muted-foreground shrink-0 font-mono">
                                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                                  </span>
                                                  <span className={
                                                    entry.level === "error" ? "text-red-500" :
                                                    entry.level === "warn" ? "text-amber-500" :
                                                    "text-foreground"
                                                  }>
                                                    {entry.message}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">Failed to load details</p>
                                    )}

                                    <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                                      <p className="text-[11px] text-muted-foreground">
                                        Permanently delete this migration and its files.
                                      </p>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        disabled={deletingMigration === m.id}
                                        onClick={() => deleteMigration(m)}
                                      >
                                        {deletingMigration === m.id ? (
                                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="mr-1.5 h-3 w-3" />
                                        )}
                                        Delete migration
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        )}

                        <Separator />
                        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-3">
                          <div>
                            <p className="text-xs font-medium text-destructive">
                              Danger zone
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Permanently delete this user and all their data.
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletingUser === u.id}
                            onClick={() => deleteUser(u)}
                          >
                            {deletingUser === u.id ? (
                              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1.5 h-3 w-3" />
                            )}
                            Delete user
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {users.length === 0 && !loadingUsers && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No users found
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* Costs tab */}
        <TabsContent value="costs">
          {loadingCosts ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {costBreakdown.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No migration cost data yet
                </p>
              )}
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Project</th>
                      <th className="px-3 py-2 text-left font-medium">User</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Payment</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens</th>
                      <th className="px-3 py-2 text-right font-medium">Billed</th>
                      <th className="px-3 py-2 text-right font-medium">Total API Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Margin</th>
                      <th className="px-3 py-2 text-right font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBreakdown.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => navigate(`/project/${row.project_id}/migration/${row.id}`)}
                        className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[160px]">{row.project_name}</div>
                          {row.detected_platform && (
                            <span className="text-xs text-muted-foreground capitalize">{row.detected_platform}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[160px]">{row.user_email}</td>
                        <td className="px-3 py-2">
                          <Badge variant={row.status === "completed" ? "default" : "secondary"} className="text-xs capitalize">
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={row.payment_status === "paid" ? "default" : row.payment_status === "refunded" ? "destructive" : "outline"}
                            className={`text-xs capitalize ${row.payment_status === "paid" ? "bg-green-600" : ""}`}
                          >
                            {row.payment_status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {((row.actual_input_tokens + row.actual_output_tokens) / 1000).toFixed(0)}k
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                          ${(row.actual_cost_cents / 100).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-orange-600">
                          ${(row.raw_cost_cents / 100).toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-xs font-medium ${row.margin_cents >= 0 ? "text-green-600" : "text-red-600"}`}>
                          ${(row.margin_cents / 100).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {costBreakdown.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/40 font-semibold">
                        <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground">
                          Totals ({costBreakdown.length} migrations)
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {(
                            costBreakdown.reduce(
                              (s, r) => s + r.actual_input_tokens + r.actual_output_tokens,
                              0,
                            ) / 1000
                          ).toFixed(0)}
                          k
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                          ${(costBreakdown.reduce((s, r) => s + r.actual_cost_cents, 0) / 100).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-orange-600">
                          ${(costBreakdown.reduce((s, r) => s + r.raw_cost_cents, 0) / 100).toFixed(2)}
                        </td>
                        {(() => {
                          const totalMargin = costBreakdown.reduce((s, r) => s + r.margin_cents, 0);
                          const totalRevenue = costBreakdown.reduce((s, r) => s + r.revenue_cents, 0);
                          const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null;
                          return (
                            <>
                              <td className={`px-3 py-2 text-right font-mono text-xs ${totalMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                ${(totalMargin / 100).toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 text-right font-mono text-xs whitespace-nowrap ${marginPct === null ? "text-muted-foreground" : marginPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {marginPct === null ? "—" : `${marginPct.toFixed(0)}% margin`}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium">Total API Cost</span> is the full raw
                Anthropic cost (analysis + migration run).{" "}
                <span className="font-medium">Margin</span> = what the customer paid
                − Total API Cost.
              </p>
            </div>
          )}
        </TabsContent>
        </>
        )}

        {/* Reviews tab */}
        <TabsContent value="reviews">
          {loadingReviews ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingReviews.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No migrations to review
            </p>
          ) : (
            <div className="space-y-3">
              {pendingReviews.map((r) => (
                <Card key={r.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{r.project_name}</p>
                          <Badge
                            variant={r.status === "reviewing" ? "default" : "secondary"}
                            className={`text-xs capitalize ${
                              r.status === "reviewed"
                                ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                                : ""
                            }`}
                          >
                            {r.status === "pending_review"
                              ? "awaiting review"
                              : r.status === "reviewed"
                                ? "delivered"
                                : r.status}
                          </Badge>
                          {r.detected_platform && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {r.detected_platform}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {r.user_email && <>{r.user_email} &middot; </>}
                          {r.files_migrated}/{r.files_to_migrate} files
                          {r.completed_at && ` · completed ${new Date(r.completed_at).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingCode === r.id}
                          onClick={() => downloadCode(r.id)}
                        >
                          {downloadingCode === r.id ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="mr-1.5 h-3 w-3" />
                          )}
                          Download code
                        </Button>
                        {r.status === "pending_review" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingReview === r.id}
                            onClick={() => updateReviewStatus(r.id, "reviewing")}
                          >
                            <Eye className="mr-1.5 h-3 w-3" />
                            {updatingReview === r.id ? "Updating..." : "Start Review"}
                          </Button>
                        )}
                        {r.status === "reviewed" && !revising[r.id] && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startRevision(r)}
                          >
                            <Pencil className="mr-1.5 h-3 w-3" />
                            Revise
                          </Button>
                        )}
                      </div>
                    </div>

                    {r.status === "reviewed" && !revising[r.id] && (
                      <div className="mt-4 border-t pt-4 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Delivered
                          {r.reviewed_at &&
                            ` ${new Date(r.reviewed_at).toLocaleString()}`}
                          {r.reviewed_by && ` by ${r.reviewed_by}`}
                          {r.review_artifact_name &&
                            ` · ${r.review_artifact_name}`}
                        </p>
                        {r.review_notes && (
                          <p className="text-sm whitespace-pre-wrap rounded-md bg-muted px-3 py-2">
                            {r.review_notes}
                          </p>
                        )}
                      </div>
                    )}

                    {(r.status === "reviewing" ||
                      (r.status === "reviewed" && revising[r.id])) && (
                      <div className="mt-4 border-t pt-4 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Review notes for the customer
                          </label>
                          <textarea
                            value={reviewNotes[r.id] ?? ""}
                            onChange={(e) =>
                              setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder="Summary of findings, changes you made, and anything the customer should know..."
                            rows={4}
                            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Reviewed code (.zip, optional)
                          </label>
                          <input
                            type="file"
                            accept=".zip,application/zip,application/x-zip-compressed"
                            onChange={(e) =>
                              setReviewFiles((prev) => ({
                                ...prev,
                                [r.id]: e.target.files?.[0] ?? null,
                              }))
                            }
                            className="mt-1 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
                          />
                          {reviewFiles[r.id] ? (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Selected: {reviewFiles[r.id]!.name}
                            </p>
                          ) : (
                            r.status === "reviewed" &&
                            r.review_artifact_name && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Current: {r.review_artifact_name} (upload to
                                replace)
                              </p>
                            )
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          {r.status === "reviewed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deliveringReview === r.id}
                              onClick={() =>
                                setRevising((prev) => ({
                                  ...prev,
                                  [r.id]: false,
                                }))
                              }
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={deliveringReview === r.id}
                            onClick={() => deliverReview(r.id)}
                          >
                            {deliveringReview === r.id ? (
                              <>
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                {r.status === "reviewed"
                                  ? "Updating..."
                                  : "Delivering..."}
                              </>
                            ) : r.status === "reviewed" ? (
                              "Update delivered review"
                            ) : (
                              "Deliver review to customer"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tickets tab */}
        {!reviewerOnly && (
        <TabsContent value="tickets">
          <div className="flex gap-2 mb-4">
            {["all", "open", "in_progress", "resolved", "closed"].map((s) => (
              <Button
                key={s}
                variant={ticketFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTicketFilter(s);
                  loadTickets(s);
                }}
                className="capitalize"
              >
                {s.replace("_", " ")}
              </Button>
            ))}
          </div>

          {loadingTickets ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <Card key={t.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{t.subject}</CardTitle>
                        <CardDescription>
                          {t.user_email} &middot;{" "}
                          {new Date(t.created_at).toLocaleString()} &middot;{" "}
                          <span className="capitalize">{t.type}</span>
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="capitalize text-xs">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STATUS_COLORS[t.status] || "bg-gray-500"}`}
                        />
                        {t.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm whitespace-pre-wrap">
                      {t.description}
                    </p>

                    {t.image_urls && t.image_urls.length > 0 && (
                      <div className="flex gap-2">
                        {t.image_urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-20 h-20 rounded border overflow-hidden block"
                          >
                            <img
                              src={url}
                              alt={`Attachment ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {t.admin_notes && (
                      <div className="bg-muted/50 rounded p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Admin Notes
                        </p>
                        <p className="text-sm whitespace-pre-wrap">
                          {t.admin_notes}
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center gap-2">
                      <select
                        value={t.status}
                        onChange={(e) =>
                          updateTicket(t.id, { status: e.target.value })
                        }
                        className="text-xs border rounded px-2 py-1 bg-background"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>

                      {editingTicket === t.id ? (
                        <div className="flex-1 flex gap-2">
                          <Input
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            placeholder="Add admin notes..."
                            className="text-xs h-8"
                          />
                          <Button
                            size="sm"
                            onClick={() =>
                              updateTicket(t.id, { admin_notes: adminNotes })
                            }
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingTicket(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingTicket(t.id);
                            setAdminNotes(t.admin_notes || "");
                          }}
                        >
                          {t.admin_notes ? "Edit Notes" : "Add Notes"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {tickets.length === 0 && !loadingTickets && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No tickets found
                </p>
              )}
            </div>
          )}
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
