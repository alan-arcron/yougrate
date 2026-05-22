import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: May 21, 2026
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Service Description</h2>
            <p className="text-muted-foreground leading-relaxed">
              Yougrate is an AI-powered code migration tool operated by Arcron
              Information Systems ("Arcron", "we", "us"). The service analyzes
              source code from supported platforms (such as Lovable, Base44,
              Bolt, and Replit), rewrites it for deployment on Vercel with
              Supabase, and deploys the result to your connected accounts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Account Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may create an account using GitHub OAuth or email and
              password, authenticated through Supabase. You are responsible for
              maintaining the security of your login credentials and any
              connected third-party tokens (GitHub, Vercel). You must be at
              least 18 years old or the age of majority in your jurisdiction to
              use this service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. AI-Powered Migrations</h2>
            <p className="text-muted-foreground leading-relaxed">
              Yougrate uses artificial intelligence (Anthropic's Claude) to
              analyze and rewrite your code. While we strive for accuracy and
              include automatic build-error detection and fix attempts (up to 3
              retries per deployment), <strong>AI can and does make mistakes</strong>.
              Migrations are not guaranteed to produce a perfectly functioning
              application. You are responsible for reviewing and testing all
              migrated code before using it in production.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Yougrate and Arcron Information Systems are <strong>not
              responsible</strong> for any errors, data loss, downtime, or
              damages resulting from migrated code. The service is provided on
              an "as-is" basis.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              If you need professional assistance with your migrated code,
              Arcron Information Systems offers software engineering services.
              Contact us at{" "}
              <a href="mailto:yougrate@arcron.systems" className="text-primary hover:underline">
                yougrate@arcron.systems
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Payments and Refunds</h2>
            <p className="text-muted-foreground leading-relaxed">
              Payments are processed securely through Stripe. Migration fees
              consist of a base fee plus a token-usage charge based on the
              complexity of your codebase. A receipt is sent to your email
              address after each successful payment.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              <strong>Fees are non-refundable once a migration has
              started.</strong> If a migration fails entirely due to a platform
              error (not a code issue), contact us and we will evaluate on a
              case-by-case basis.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Third-Party Integrations</h2>
            <p className="text-muted-foreground leading-relaxed">
              To use Yougrate, you voluntarily connect your GitHub and Vercel
              accounts by providing access tokens. You also provide your
              Supabase project URL and anon key. Yougrate uses these
              credentials solely to perform migrations and deployments on your
              behalf. You may revoke access at any time by disconnecting your
              accounts in Settings or revoking tokens directly on the
              respective platforms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to use Yougrate to migrate code you do not have the
              right to use, modify, or redistribute. You are solely responsible
              for ensuring you have the necessary rights and licenses for the
              source code you submit for migration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Service Availability</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not guarantee uninterrupted or error-free operation of the
              service. Yougrate may be temporarily unavailable for maintenance,
              updates, or due to circumstances beyond our control. We reserve
              the right to modify or discontinue the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, Arcron Information
              Systems shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of
              profits or revenues, whether incurred directly or indirectly, or
              any loss of data, use, goodwill, or other intangible losses
              resulting from your use of the service. Our total aggregate
              liability shall not exceed the amount you paid us in the 12
              months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms from time to time. Continued use of the
              service after changes constitutes acceptance of the updated
              terms. Material changes will be communicated via email or an
              in-app notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these terms, contact us at{" "}
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
