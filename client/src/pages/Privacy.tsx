import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: May 21, 2026
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Who We Are</h2>
            <p className="text-muted-foreground leading-relaxed">
              Yougrate is operated by Arcron Information Systems ("Arcron",
              "we", "us"). This policy describes what data we collect, how we
              use it, and your rights regarding that data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Data We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We collect only the data necessary to provide the migration
              service:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>Account information:</strong> Email address, display
                name, and avatar URL provided by your authentication provider
                (GitHub or email signup).
              </li>
              <li>
                <strong>GitHub credentials:</strong> OAuth access token and
                username, used to read your source repositories and push
                migrated code.
              </li>
              <li>
                <strong>Vercel credentials:</strong> Access token, used to
                create projects and trigger deployments on your behalf.
              </li>
              <li>
                <strong>Supabase configuration:</strong> Your Supabase project
                URL and anonymous key, used to configure environment variables
                in your deployed application.
              </li>
              <li>
                <strong>Source code:</strong> Your repository files are read
                during analysis and migration. Code content is processed
                temporarily and stored in AWS S3 during active migrations.
              </li>
              <li>
                <strong>Billing information:</strong> Stripe customer ID,
                payment amounts, token usage, and transaction status. Card
                details are handled entirely by Stripe and never touch our
                servers.
              </li>
              <li>
                <strong>Support submissions:</strong> Email address, subject,
                description, and any images you upload when submitting a
                support ticket.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Data</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>To perform migrations:</strong> Analyzing your code,
                rewriting files, pushing to GitHub, and deploying to Vercel.
              </li>
              <li>
                <strong>To process payments:</strong> Creating Stripe checkout
                sessions and recording billing events.
              </li>
              <li>
                <strong>To provide support:</strong> Responding to bug reports
                and questions you submit.
              </li>
              <li>
                <strong>To send transactional emails:</strong> Payment
                receipts, support ticket confirmations, and service-critical
                notifications.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              4. We Do Not Share Your Data
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong>
                Your data is never sold, shared with, or disclosed to any third
                parties for marketing, analytics, advertising, or any purpose
                beyond operating this service.
              </strong>
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              The only third-party services that process your data are those
              strictly required to operate Yougrate:
            </p>
            <ul className="space-y-2 text-muted-foreground mt-2">
              <li>
                <strong>Supabase</strong> — Authentication and database hosting
                (US region).
              </li>
              <li>
                <strong>Stripe</strong> — Payment processing. Card details are
                handled solely by Stripe.
              </li>
              <li>
                <strong>AWS S3</strong> — Temporary storage of migration
                workspace files and support ticket images.
              </li>
              <li>
                <strong>AWS SES</strong> — Sending transactional emails
                (receipts, ticket confirmations).
              </li>
              <li>
                <strong>GitHub API</strong> — Reading source repositories and
                pushing migrated code, using your provided token.
              </li>
              <li>
                <strong>Vercel API</strong> — Creating projects and deployments,
                using your provided token.
              </li>
              <li>
                <strong>Anthropic (Claude API)</strong> — Your source code is
                sent to Anthropic's API for analysis and migration. Per
                Anthropic's API terms, data sent through the API is not used to
                train their models.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Storage and Retention</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>Database:</strong> Account information, project
                metadata, migration records, and billing events are stored in a
                PostgreSQL database hosted on Supabase in the United States.
              </li>
              <li>
                <strong>Source code:</strong> Repository files are stored
                temporarily in AWS S3 during active migrations and are not
                retained long-term after migration completion.
              </li>
              <li>
                <strong>OAuth tokens:</strong> GitHub and Vercel access tokens
                are encrypted at the application layer (AES-256-GCM) before being
                stored, on top of the database's own encryption-at-rest, and are
                never returned to the browser.
              </li>
              <li>
                <strong>Support images:</strong> Images uploaded with bug
                reports are stored in AWS S3 and retained for the lifetime of
                the support ticket.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>Access:</strong> You can view your account information,
                projects, and migrations at any time through the dashboard.
              </li>
              <li>
                <strong>Deletion:</strong> You may request complete deletion of
                your account and all associated data (projects, migrations,
                billing history) by contacting us. Deletion is permanent and
                cannot be reversed.
              </li>
              <li>
                <strong>Token revocation:</strong> You can disconnect your
                GitHub and Vercel accounts at any time through Settings, or
                revoke tokens directly on those platforms.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              Yougrate does not use any analytics cookies, tracking pixels, or
              third-party analytics services. The only client-side storage used
              is for authentication session management (Supabase auth tokens in
              local storage).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy from time to time. Material changes will
              be communicated via email or an in-app notice. Continued use of
              the service after changes constitutes acceptance of the updated
              policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about this privacy policy or to exercise your data
              rights, contact us at{" "}
              <a href="mailto:yougrate@arcron.systems" className="text-primary hover:underline">
                yougrate@arcron.systems
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
