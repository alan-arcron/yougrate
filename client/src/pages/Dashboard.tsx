import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderGit2, ArrowRight } from "lucide-react";
import { GithubIcon } from "@/components/icons";

interface Project {
  id: string;
  name: string;
  github_repo_full_name: string;
  detected_platform: string | null;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  created: "bg-zinc-500",
  analyzing: "bg-blue-500",
  analyzed: "bg-cyan-500",
  migrating: "bg-amber-500",
  migrated: "bg-green-500",
  deploying: "bg-purple-500",
  deployed: "bg-emerald-500",
  failed: "bg-red-500",
};

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Project[]>("/projects")
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (searchParams.get("unlocked") === "true") {
      api.post<{ unlocked: boolean }>("/billing/verify-unlock")
        .then((res) => {
          if (res.unlocked) {
            toast.success("Analyses unlocked! You can now run 2 more analyses.");
          }
        })
        .catch(() => {
          toast.success("Payment received! Your analyses will be unlocked shortly.");
        });
    }
  }, [searchParams]);

  return (
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground mt-1">
              Migrate your vibe-coded apps to Vercel and Supabase
            </p>
          </div>
          <Button onClick={() => navigate("/new")} size="lg">
            <Plus className="mr-2 h-4 w-4" />
            New Migration
          </Button>
        </div>

        {!profile?.github_connected && (
          <Card className="mb-8 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <GithubIcon className="h-5 w-5 text-amber-600" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Connect your GitHub account to import repositories
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/settings")}
              >
                Connect GitHub
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 w-32 bg-muted rounded" />
                  <div className="h-4 w-48 bg-muted rounded mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No projects yet</h3>
              <p className="text-muted-foreground text-sm mt-1 mb-4">
                Import a GitHub repo to start migrating
              </p>
              <Button onClick={() => navigate("/new")}>
                <Plus className="mr-2 h-4 w-4" />
                New Migration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs capitalize">
                      <span
                        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STATUS_COLORS[p.status] || "bg-gray-500"}`}
                      />
                      {p.status}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {p.github_repo_full_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    {p.detected_platform && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {p.detected_platform}
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
  );
}
