import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let _ses: SESClient | null = null;

function getClient(): SESClient {
  if (!_ses) {
    _ses = new SESClient({
      region: process.env.AWS_REGION || "us-east-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return _ses;
}

const FROM_EMAIL = () => process.env.SES_FROM_EMAIL || "noreply@arcron.systems";

function getAdminEmail(): string | null {
  const email = process.env.SES_TO_EMAIL;
  if (!email || email.trim() === "") {
    console.warn("[email] SES_TO_EMAIL not configured, skipping admin notification");
    return null;
  }
  return email.trim();
}

function htmlLayout(content: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>Yougrate</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body { margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .wrapper { width: 100%; background-color: #f4f4f5; padding: 40px 0; }
  .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
  .header { padding: 32px 40px 24px; border-bottom: 1px solid #e4e4e7; }
  .header img { height: 28px; }
  .header-text { font-size: 20px; font-weight: 700; color: #09090b; letter-spacing: -0.02em; }
  .body { padding: 32px 40px; }
  .body p { margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #3f3f46; }
  .body p:last-child { margin-bottom: 0; }
  .body strong { color: #09090b; }
  .meta { background: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
  .meta-row { font-size: 13px; color: #52525b; line-height: 1.5; }
  .meta-label { color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .btn { display: inline-block; padding: 10px 24px; background: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; }
  .footer { padding: 24px 40px; border-top: 1px solid #e4e4e7; }
  .footer p { margin: 0; font-size: 12px; color: #a1a1aa; line-height: 1.5; }
  .footer a { color: #a1a1aa; }
  .preview { display: none; max-height: 0; overflow: hidden; mso-hide: all; }
</style>
</head>
<body>
<div class="preview">${previewText}</div>
<div class="wrapper">
<div class="container">
<div class="header">
  <span class="header-text">Yougrate</span>
</div>
<div class="body">
${content}
</div>
<div class="footer">
  <p>&copy; ${new Date().getFullYear()} Arcron Information Systems. All rights reserved.</p>
  <p style="margin-top: 8px;"><a href="${process.env.CLIENT_URL || "http://localhost:5175"}">yougrate.com</a></p>
</div>
</div>
</div>
</body>
</html>`;
}

interface TicketInfo {
  id: string;
  type: string;
  subject: string;
  description: string;
  user_email: string;
  image_urls?: string[];
}

export async function sendSupportNotification(ticket: TicketInfo): Promise<void> {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;

  // Attachments are stored as private S3 keys and are only viewable via the
  // admin page (which mints short-lived signed URLs). Never embed raw links.
  const attachmentCount = (ticket.image_urls || []).length;
  const images = attachmentCount > 0
    ? `<p><strong>${attachmentCount}</strong> attachment(s) — view them on the admin page.</p>`
    : "";

  const html = htmlLayout(`
<p>New <strong>${ticket.type}</strong> report from <strong>${ticket.user_email}</strong></p>
<div class="meta">
  <div class="meta-row"><span class="meta-label">Ticket ID</span><br/>${ticket.id}</div>
  <div class="meta-row" style="margin-top: 8px;"><span class="meta-label">Subject</span><br/>${ticket.subject}</div>
</div>
<p>${ticket.description.replace(/\n/g, "<br/>")}</p>
${images}
<p style="margin-top: 24px;">
  <a href="${process.env.CLIENT_URL || "http://localhost:5175"}/admin" class="btn">View in Admin</a>
</p>
`, `New ${ticket.type} report: ${ticket.subject}`);

  const plainText = `New ${ticket.type} report from ${ticket.user_email}\n\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}\n\n${ticket.description}`;

  const cmd = new SendEmailCommand({
    Source: FROM_EMAIL(),
    Destination: { ToAddresses: [adminEmail] },
    Message: {
      Subject: { Data: `[Yougrate ${ticket.type}] ${ticket.subject}` },
      Body: {
        Html: { Data: html },
        Text: { Data: plainText },
      },
    },
  });

  try {
    await getClient().send(cmd);
  } catch (err) {
    console.error("[email] Failed to send admin notification:", err);
  }
}

export async function sendReviewDelivered(opts: {
  to: string;
  projectName: string;
  migrationId: string;
  hasNotes: boolean;
  hasCode: boolean;
}): Promise<void> {
  if (!opts.to) return;

  const clientUrl = process.env.CLIENT_URL || "http://localhost:5175";
  const link = `${clientUrl}/migrations/${opts.migrationId}`;

  const extras: string[] = [];
  if (opts.hasNotes) extras.push("notes from the reviewer");
  if (opts.hasCode) extras.push("a downloadable copy of the reviewed code");
  const extrasText =
    extras.length > 0 ? ` You'll find ${extras.join(" and ")} on your migration page.` : "";

  const html = htmlLayout(`
<p>Hi,</p>
<p>Good news — the code review for <strong>${opts.projectName}</strong> is complete.${extrasText}</p>
<div class="meta">
  <div class="meta-row"><span class="meta-label">Project</span><br/>${opts.projectName}</div>
</div>
<p>Open your migration to read the reviewer's notes${opts.hasCode ? ", download the reviewed code, or push it straight to your GitHub repo" : ""}.</p>
<p style="margin-top: 24px;">
  <a href="${link}" class="btn">View your review</a>
</p>
`, `Your code review for ${opts.projectName} is complete`);

  const plainText = `Hi,\n\nThe code review for ${opts.projectName} is complete.${extrasText}\n\nView it here: ${link}\n\n— Yougrate by Arcron Information Systems`;

  const cmd = new SendEmailCommand({
    Source: FROM_EMAIL(),
    Destination: { ToAddresses: [opts.to] },
    Message: {
      Subject: { Data: `Your code review for ${opts.projectName} is complete` },
      Body: {
        Html: { Data: html },
        Text: { Data: plainText },
      },
    },
  });

  try {
    await getClient().send(cmd);
  } catch (err) {
    console.error("[email] Failed to send review-delivered email:", err);
  }
}

export async function sendTicketConfirmation(ticket: TicketInfo): Promise<void> {
  const html = htmlLayout(`
<p>Hi,</p>
<p>Thanks for reaching out. We've received your <strong>${ticket.type}</strong> report and will get back to you as soon as possible.</p>
<div class="meta">
  <div class="meta-row"><span class="meta-label">Ticket ID</span><br/>${ticket.id}</div>
  <div class="meta-row" style="margin-top: 8px;"><span class="meta-label">Subject</span><br/>${ticket.subject}</div>
</div>
<p>We typically respond within 24 hours. If your issue is urgent, reply to this email with additional details.</p>
<p style="color: #a1a1aa; font-size: 12px; margin-top: 24px;">You're receiving this because you submitted a support request on Yougrate.</p>
`, `We received your ${ticket.type} report — ${ticket.subject}`);

  const plainText = `Hi,\n\nThanks for reaching out. We've received your ${ticket.type} report and will get back to you as soon as possible.\n\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}\n\nWe typically respond within 24 hours.\n\n— Yougrate by Arcron Information Systems`;

  const cmd = new SendEmailCommand({
    Source: FROM_EMAIL(),
    Destination: { ToAddresses: [ticket.user_email] },
    Message: {
      Subject: { Data: `We received your ${ticket.type} report — ${ticket.subject}` },
      Body: {
        Html: { Data: html },
        Text: { Data: plainText },
      },
    },
  });

  try {
    await getClient().send(cmd);
  } catch (err) {
    console.error("[email] Failed to send confirmation:", err);
  }
}
