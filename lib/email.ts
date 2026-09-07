import { BrevoClient } from "@getbrevo/brevo";

let client: BrevoClient | undefined;

function getClient(): BrevoClient {
  if (!client) {
    client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY ?? "" });
  }
  return client;
}

// Falls back to logging instead of sending when Brevo isn't configured, so every flow
// that calls this stays fully testable locally without a Brevo account -- see
// docs/infrastructure.md, which explicitly deferred Brevo setup until the domain was live.
export async function sendEmail(input: { to: string; subject: string; html: string }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    console.log(`[email] Brevo not configured -- would have sent to ${input.to}:\nSubject: ${input.subject}\n${input.html}`);
    return;
  }

  await getClient().transactionalEmails.sendTransacEmail({
    sender: { name: "NTS LMS", email: senderEmail },
    to: [{ email: input.to }],
    subject: input.subject,
    htmlContent: input.html,
  });
}

const BUTTON_STYLE =
  "display:inline-block;margin-top:8px;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;";

function emailShell(bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:24px;">
        <div style="width:32px;height:32px;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;font-size:14px;line-height:32px;text-align:center;">N</div>
        <span style="font-weight:600;color:#0f172a;">NTS LMS</span>
      </div>
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#94a3b8;">If you weren't expecting this email, you can safely ignore it.</p>
    </div>
  `;
}

export function passwordResetEmail(url: string) {
  return {
    subject: "Reset your NTS LMS password",
    html: emailShell(`
      <p style="color:#0f172a;font-size:15px;">Click the button below to choose a new password. This link expires in 1 hour.</p>
      <p><a href="${url}" style="${BUTTON_STYLE}">Reset password</a></p>
    `),
  };
}

export function companyInvitationEmail(organizationName: string, url: string) {
  return {
    subject: `You've been invited to join ${organizationName} on NTS LMS`,
    html: emailShell(`
      <p style="color:#0f172a;font-size:15px;">You've been invited to join <strong>${organizationName}</strong> on NTS LMS.</p>
      <p><a href="${url}" style="${BUTTON_STYLE}">Accept invitation</a></p>
    `),
  };
}

export function adminInvitationEmail(url: string) {
  return {
    subject: "You've been invited as an NTS LMS admin",
    html: emailShell(`
      <p style="color:#0f172a;font-size:15px;">You've been invited to join NTS LMS as an admin, with full access across every company.</p>
      <p><a href="${url}" style="${BUTTON_STYLE}">Accept invitation</a></p>
    `),
  };
}
