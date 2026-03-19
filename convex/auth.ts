import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { Resend } from "resend";

const siteUrl = process.env.SITE_URL!;

const fromAddress = "World Monitor <noreply@worldmonitor.app>";

// Lazy singleton -- Resend throws if API key is missing at construction time,
// but Convex analyzes module-level code during deployment. Deferring to first
// call avoids the error when RESEND_API_KEY is not yet set.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export const authComponent = createClient<DataModel>(components.betterAuth, {
  verbose: false,
});

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    trustedOrigins: [
      siteUrl,
      'http://localhost:3000',
      'https://worldmonitor.app',
      'https://tech.worldmonitor.app',
      'https://finance.worldmonitor.app',
      'https://commodity.worldmonitor.app',
      'https://happy.worldmonitor.app',
      'https://dash.better-auth.com',
      '*.worldmonitor.app',
      'https://valiant-bison-406.convex.site',
      'https://tacit-curlew-777.convex.site',
    ],
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    // NOTE: Do NOT use additionalFields for role — the Convex betterAuth
    // component has a strict validator that rejects unknown fields.
    // Roles are stored in the separate userRoles table instead.
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          const subjectByType: Record<string, string> = {
            'sign-in': 'Your WorldMonitor sign-in code',
            'email-verification': 'Verify your WorldMonitor email',
            'forget-password': 'Your WorldMonitor password reset code',
            'change-email': 'Confirm your new email address',
          };
          await getResend().emails.send({
            from: fromAddress,
            to: email,
            subject: subjectByType[type] ?? 'Your WorldMonitor code',
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
                <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600;">WorldMonitor</h2>
                <p style="margin: 0 0 24px; color: #666; font-size: 14px;">Your verification code</p>
                <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">
                  Use the code below to continue. It expires in 5 minutes.
                </p>
                <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 8px 0 24px;">
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e;">${otp}</span>
                </div>
                <p style="margin: 0 0 8px; font-size: 13px; color: #888; line-height: 1.4;">
                  If you did not request this code, you can safely ignore this email.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
                <p style="margin: 0; font-size: 12px; color: #aaa;">WorldMonitor &mdash; Real-time global intelligence</p>
              </div>
            `,
          });
        },
        otpLength: 6,
        expiresIn: 300,
        sendVerificationOnSignUp: true,
      }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
