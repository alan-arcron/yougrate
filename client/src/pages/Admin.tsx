import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
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
  ExternalLink,
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
  project_name: string;
  user_email: string;
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

interface UserMigration {
  id: string;
  status: string;
  detected_platform: string | null;
  project_name: string;
  github_repo_full_name: string;
  files_to_migrate: number;
  files_migrated: number;
  actual_cost_cents: number;
  estimated_cost_cents: number;
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
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_cents: number;
  actual_input_tokens: number;
  actual_output_tokens: number;
  actual_cost_cents: number;
  raw_cost_cents: number;
  revenue_cents: number;
  margin_cents: number;
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

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!profile.is_admin) {
      navigate("/dashboard");
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
      const migrations = await api.get<UserMigration[]>(
        `/admin/users/${userId}/migrations`,
      );
      setUserMigrations(migrations);
    } catch {
      setUserMigrations([]);
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
  if (!profile.is_admin) return null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      {/* Stats */}
      {stats && (
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
                    <p className="text-xs text-muted-foreground">Margin</p>
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
        defaultValue="users"
        onValueChange={(v) => {
          if (v === "users") loadUsers();
          if (v === "tickets") loadTickets(ticketFilter);
          if (v === "costs") loadCosts();
          if (v === "reviews") loadReviews();
        }}
      >
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

        {/* Users tab */}
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
                          <p className="text-sm font-medium truncate">
                            {u.email}
                          </p>
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
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Analyses
                            </p>
                            <p className="font-medium">
                              {u.free_analyses_used} / {u.free_analyses_limit}
                            </p>
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
                          Migrations
                        </p>
                        {userMigrations.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No migrations
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {userMigrations.map((m) => (
                              <div key={m.id} className="rounded border">
                                <button
                                  onClick={() => toggleMigrationExpand(m.id)}
                                  className="w-full flex items-center justify-between text-xs px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-medium">{m.project_name}</span>
                                    <span className="text-muted-foreground">{m.github_repo_full_name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {m.actual_cost_cents > 0 && (
                                      <span className="font-mono text-muted-foreground">
                                        ${(m.actual_cost_cents / 100).toFixed(2)}
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
                                        {/* Cost comparison */}
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Cost Breakdown</p>
                                          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Analysis</p>
                                              <p className="text-sm font-mono font-medium">
                                                {((migrationDetail.analysis_input_tokens + migrationDetail.analysis_output_tokens) / 1000).toFixed(0)}k tok
                                              </p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">API Cost</p>
                                              <p className="text-sm font-mono font-medium text-orange-600">${(migrationDetail.raw_cost_cents / 100).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Billed</p>
                                              <p className="text-sm font-mono font-medium text-muted-foreground">${(migrationDetail.actual_cost_cents / 100).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Revenue</p>
                                              <p className="text-sm font-mono font-medium">${(migrationDetail.revenue_cents / 100).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Margin</p>
                                              <p className={`text-sm font-mono font-medium ${migrationDetail.margin_cents >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                ${(migrationDetail.margin_cents / 100).toFixed(2)}
                                              </p>
                                            </div>
                                            <div className="bg-muted/50 rounded p-2">
                                              <p className="text-xs text-muted-foreground">Markup</p>
                                              <p className="text-sm font-mono font-medium">
                                                {migrationDetail.raw_cost_cents > 0
                                                  ? `${(migrationDetail.revenue_cents / migrationDetail.raw_cost_cents).toFixed(1)}x`
                                                  : "—"}
                                              </p>
                                            </div>
                                          </div>
                                        </div>

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
                                                {migrationDetail.estimated_input_tokens + migrationDetail.estimated_output_tokens > 0
                                                  ? `${(((migrationDetail.actual_input_tokens + migrationDetail.actual_output_tokens) / (migrationDetail.estimated_input_tokens + migrationDetail.estimated_output_tokens)) * 100).toFixed(0)}%`
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
                                            </p>
                                          )}
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
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
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
                      <th className="px-3 py-2 text-right font-medium">API Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Billed</th>
                      <th className="px-3 py-2 text-right font-medium">Revenue</th>
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
                        <td className="px-3 py-2 text-right font-mono text-xs text-orange-600">
                          ${(row.raw_cost_cents / 100).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                          ${(row.actual_cost_cents / 100).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          ${(row.revenue_cents / 100).toFixed(2)}
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
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Reviews tab */}
        <TabsContent value="reviews">
          {loadingReviews ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingReviews.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No migrations awaiting review
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
                            className="text-xs capitalize"
                          >
                            {r.status === "pending_review" ? "awaiting review" : r.status}
                          </Badge>
                          {r.detected_platform && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {r.detected_platform}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {r.user_email} &middot; {r.files_migrated}/{r.files_to_migrate} files
                          {r.completed_at && ` · completed ${new Date(r.completed_at).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.output_repo_url && (
                          <a
                            href={r.output_repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="outline" size="sm">
                              <ExternalLink className="mr-1.5 h-3 w-3" />
                              View Code
                            </Button>
                          </a>
                        )}
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
                        {r.status === "reviewing" && (
                          <Button
                            size="sm"
                            disabled={updatingReview === r.id}
                            onClick={() => updateReviewStatus(r.id, "reviewed")}
                          >
                            {updatingReview === r.id ? "Updating..." : "Mark Reviewed"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tickets tab */}
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
      </Tabs>
    </div>
  );
}
