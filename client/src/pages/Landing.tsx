import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  GitBranch,
  Shield,
  Rocket,
  Eye,
  DollarSign,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Wrench,
  X,
  Database,
  Globe,
  Bot,
  Code2,
  Headphones,
  Server,
} from "lucide-react";

function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return <img src="/yougrate.png" alt="Yougrate" className={className} />;
}

const PLATFORMS = [
  { name: "Lovable", detected: true },
  { name: "Base44", detected: true },
  { name: "Bolt", detected: true },
  { name: "Replit", detected: true },
];

const FEATURES = [
  {
    icon: Bot,
    title: "AI-Powered Analysis",
    description:
      "Claude analyzes every file in your repo to detect platform-specific code and plan the migration automatically.",
  },
  {
    icon: Database,
    title: "Database Schema Included",
    description:
      "Every migration generates your full Supabase schema — tables, relationships, indexes, and RLS policies — and can create them in your database for you. No add-on, no extra fee. (Importing your existing rows is a quick separate step we guide you through.)",
  },
  {
    icon: Wrench,
    title: "Automatic Error Fixes",
    description:
      "Build failures on Vercel are caught, diagnosed by AI, and fixed with a new commit — up to 3 attempts, zero manual work.",
  },
  {
    icon: Eye,
    title: "Live Build Logs",
    description:
      "Watch every step in real-time: analysis progress, file-by-file migration, build output, and AI fix attempts.",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description:
      "Deploys straight to Vercel production with your Supabase environment variables configured automatically.",
  },
  {
    icon: Server,
    title: "Backends Welcome",
    description:
      "Apps that need a real long-running server aren't left out — we detect them and deploy the backend to Railway while the frontend goes to Vercel.",
  },
  {
    icon: GitBranch,
    title: "GitHub Integration",
    description:
      "Push migrated code to a brand new repo or a branch on your existing one. Your code, your GitHub.",
  },
  {
    icon: DollarSign,
    title: "Usage-Based Pricing",
    description:
      "Pay only for AI tokens used during migration. No subscriptions, no monthly fees, no surprises.",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Connect GitHub",
    description: "Sign in with GitHub and pick the repo you want to migrate.",
  },
  {
    number: "2",
    title: "Connect Supabase",
    description:
      "Paste your Supabase project ID and anon key. Free tier works great.",
  },
  {
    number: "3",
    title: "One Click",
    description:
      "AI rewrites your code, generates your database schema, pushes to GitHub, and deploys to Vercel. You're done.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { underConstruction } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {underConstruction && (
        <div className="bg-amber-500 text-amber-950 text-center py-2.5 px-4 text-sm font-medium">
          🚧 We&apos;re currently making improvements to Yougrate. Sign-ups and
          the dashboard are temporarily paused — please check back soon.
        </div>
      )}

      {/* Promo banner */}
      <div className="bg-primary text-primary-foreground text-center py-2 px-4 text-sm">
        Summer promo: use code{" "}
        <strong className="font-bold tracking-wide">ARCRON</strong> at checkout
        for a <strong>free senior engineer code review</strong> — just select
        the code review add-on.
      </div>

      {/* Nav */}
      <header className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span
              className="text-xl tracking-tight"
              style={{ fontFamily: "'Righteous', cursive" }}
            >
              Yougrate
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/support")}
            >
              Support
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/login")}
            >
              Log in
            </Button>
            <Button size="sm" onClick={() => navigate("/login")}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Badge variant="secondary" className="mb-6 text-sm px-4 py-1.5">
            Supports Lovable, Base44, Bolt, and Replit
          </Badge>
          <h1
            className="text-5xl md:text-7xl tracking-tight leading-[1.1]"
            style={{ fontFamily: "'Righteous', cursive" }}
          >
            Stop renting your app.
            <br />
            <span className="text-primary">Own it.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Migrate your vibe-coded apps &mdash; code and database schema
            &mdash; off Lovable, Base44, and other platforms to Vercel and
            Supabase in minutes. One click. Full ownership.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button
              size="lg"
              className="text-base px-8"
              onClick={() => navigate("/login")}
            >
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8"
              onClick={() =>
                document
                  .getElementById("how-it-works")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            First 2 analyses free. No credit card required.
          </p>
        </div>
      </section>

      {/* Cost Comparison */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              The real cost of "free" platforms
            </h2>
            <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
              Hosted builders charge monthly forever. Migrate once and keep your
              money.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Lovable / Hosted */}
            <Card className="border-destructive/30 bg-destructive/5 relative overflow-hidden">
              <CardHeader>
                <CardDescription className="text-destructive font-medium uppercase tracking-wider text-xs">
                  Staying on Lovable / Base44
                </CardDescription>
                <CardTitle className="text-2xl">$20&ndash;$100/mo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Recurring monthly subscription",
                  "Proprietary code you can't export cleanly",
                  "Limited scaling options",
                  "Vendor decides your pricing and features",
                  "Lose access if you stop paying",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
                <Separator className="my-3" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-destructive">
                    $240&ndash;$1,200/year
                  </strong>{" "}
                  and you still don't own your code.
                </p>
              </CardContent>
            </Card>

            {/* Yougrate */}
            <Card className="border-primary/30 bg-primary/5 relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <Badge className="text-xs">Recommended</Badge>
              </div>
              <CardHeader>
                <CardDescription className="text-primary font-medium uppercase tracking-wider text-xs">
                  Migrate with Yougrate
                </CardDescription>
                <CardTitle className="text-2xl">One-time from $30</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Pay once, own your code forever",
                  "Standard React + Supabase Postgres",
                  "Database schema & tables migrated for you",
                  "Vercel free tier handles most apps",
                  "Supabase free tier: 500MB + 50K MAU",
                  "Scale when you need to, on your terms",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
                <Separator className="my-3" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-primary">
                    $0/mo after migration
                  </strong>{" "}
                  on free tiers. Scale up only when you're ready.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Own Your Stack */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Your code. Your infrastructure. Your future.
            </h2>
            <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
              Owning your tech stack isn't just about saving money &mdash; it's
              about setting yourself up for long-term success.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Full Control</CardTitle>
                <CardDescription>
                  Your code lives in your GitHub. Deploy anywhere. Customize
                  anything. No permission needed from a platform vendor.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Built to Scale</CardTitle>
                <CardDescription>
                  Vercel's edge network and Supabase's managed Postgres scale
                  from side project to production traffic without
                  re-architecting.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Globe className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Zero Lock-In</CardTitle>
                <CardDescription>
                  Standard React, standard Postgres. Thousands of developers
                  know this stack. Hire anyone, switch hosts anytime.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Three steps. That's it.
            </h2>
            <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
              No CLI tools. No manual refactoring. Connect, click, done.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <Card key={step.number} className="relative">
                <CardHeader>
                  <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mb-3">
                    {step.number}
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {step.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button
              size="lg"
              className="text-base px-8"
              onClick={() => navigate("/login")}
            >
              Start Your Migration
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Everything handled, automatically
            </h2>
            <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
              AI does the heavy lifting. You watch it happen in real-time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
            Supported Platforms
          </h2>
          <p className="text-muted-foreground mb-8">
            We detect and migrate code from these vibe-coding platforms.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {PLATFORMS.map((p) => (
              <Badge
                key={p.name}
                variant="outline"
                className="text-base px-5 py-2.5 rounded-full"
              >
                {p.name}
              </Badge>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            More platforms coming soon. Using something else?{" "}
            <a
              href="mailto:hello@yougrate.com"
              className="text-primary hover:underline"
            >
              Let us know
            </a>
            .
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Transparent pricing
            </h2>
            <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
              No subscriptions. No hidden fees. Pay per migration.
            </p>
          </div>

          <Card className="border-primary/20">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">Pay As You Go</CardTitle>
              <CardDescription>
                Only pay when you're ready to migrate
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3">
                <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-primary" />
                    <span className="font-medium">Analysis</span>
                  </div>
                  <span className="font-bold text-primary">Free</span>
                </div>
                <p className="text-xs text-muted-foreground px-4 -mt-1">
                  First 2 repos free. AI scans your code, detects the platform,
                  and shows you exactly what needs to change before you pay
                  anything.
                </p>

                <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Logo className="h-5 w-5" />
                    <span className="font-medium">Migration</span>
                  </div>
                  <span className="font-bold">$30 base + token usage</span>
                </div>
                <p className="text-xs text-muted-foreground px-4 -mt-1">
                  $30 flat fee covers overhead and full database schema
                  generation (tables, RLS, indexes). Additional cost scales with
                  your codebase size based on AI tokens consumed. You see the
                  exact price before confirming.
                </p>

                <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Rocket className="h-5 w-5 text-primary" />
                    <span className="font-medium">Deploy + Hosting</span>
                  </div>
                  <span className="font-bold text-primary">$0/mo</span>
                </div>
                <p className="text-xs text-muted-foreground px-4 -mt-1">
                  Vercel and Supabase free tiers are generous enough for most
                  apps. Upgrade on their terms when your traffic demands it.
                </p>
              </div>

              <Separator />

              <div className="text-center pt-2">
                <Button
                  size="lg"
                  className="text-base px-8"
                  onClick={() => navigate("/login")}
                >
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  No credit card required for analysis
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 bg-muted/30">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Ready to own your code?
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
            Stop paying rent on your own app. Migrate to a stack you control in
            minutes.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              className="text-base px-10"
              onClick={() => navigate("/login")}
            >
              Start Migrating
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Backed by Arcron */}
      <section className="py-20 border-t">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary mb-4">
            Backed by professionals
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Need more than a migration?
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Yougrate is built and supported by{" "}
            <a
              href="https://arcron.systems"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Arcron Information Systems
            </a>
            . If your project needs hands-on help beyond what an automated
            migration can provide, our team is here for you.
          </p>
          <div className="mt-10 grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {[
              {
                icon: Code2,
                title: "Custom Development",
                desc: "Full-stack engineering for new features or ground-up builds",
              },
              {
                icon: Wrench,
                title: "Migration Assistance",
                desc: "Hands-on support when your codebase needs extra care",
              },
              {
                icon: Shield,
                title: "Technical Consulting",
                desc: "Architecture reviews, stack audits, and scaling strategy",
              },
              {
                icon: Headphones,
                title: "Ongoing Maintenance",
                desc: "Long-term support, monitoring, and continuous improvement",
              },
            ].map((s) => (
              <Card key={s.title} className="text-left">
                <CardContent className="pt-6">
                  <s.icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => window.open("https://arcron.systems", "_blank")}
            >
              <Globe className="mr-2 h-4 w-4" />
              Visit arcron.systems
            </Button>
            <Button
              size="lg"
              onClick={() =>
                (window.location.href = "mailto:yougrate@arcron.systems")
              }
            >
              Get in Touch
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Reach us at{" "}
            <a
              href="mailto:yougrate@arcron.systems"
              className="text-primary hover:underline"
            >
              yougrate@arcron.systems
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Logo className="h-5 w-5" />
              <span style={{ fontFamily: "'Righteous', cursive" }}>
                Yougrate
              </span>
            </div>
            <button
              onClick={() => navigate("/support")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Support
            </button>
            <button
              onClick={() => navigate("/terms")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </button>
            <button
              onClick={() => navigate("/privacy")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Made with &hearts; by{" "}
            <a
              href="https://arcron.systems"
              target="_blank"
              className="text-primary hover:underline"
            >
              Arcron Information Systems
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
