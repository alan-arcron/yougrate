import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img src="/yougrate.png" alt="Yougrate" className="h-7 w-7" />
            <span
              className="text-xl tracking-tight"
              style={{ fontFamily: "'Righteous', cursive" }}
            >
              Yougrate
            </span>
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {profile?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              Dashboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/support")}
            >
              Support
            </Button>
            {profile?.is_admin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
              >
                Admin
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/settings")}
            >
              Settings
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">
            Terms
          </button>
          <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
            Privacy
          </button>
          <button onClick={() => navigate("/support")} className="hover:text-foreground transition-colors">
            Support
          </button>
        </div>
      </footer>
    </div>
  );
}
