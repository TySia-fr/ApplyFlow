import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/server/db";
import { emailEnabled, env } from "@/server/env";
import { sendEmail } from "@/server/email";
import { log } from "@/server/logger";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  user: {
    additionalFields: {
      // input: false — a client can never set these through sign-up or update.
      locale: { type: "string", defaultValue: "en", input: false },
      timezone: { type: "string", defaultValue: "UTC", input: false },
      isDemo: { type: "boolean", defaultValue: false, input: false },
      demoExpiresAt: { type: "date", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    // Only require verification when mail can actually be delivered; otherwise
    // users would be locked out by a message that never arrives.
    requireEmailVerification: emailEnabled,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: emailEnabled
      ? async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: "Reset your ApplyFlow password",
            text: `Reset your password: ${url}\n\nIf you didn't ask for this, ignore this email.`,
          });
        }
      : undefined,
  },
  emailVerification: emailEnabled
    ? {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: "Verify your ApplyFlow email",
            text: `Confirm your email address: ${url}`,
          });
        },
      }
    : undefined,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // slide expiry at most once a day
    freshAge: 60 * 15, // sensitive actions need a session younger than 15 min
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/change-password": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (s) => log.info("session.created", { userId: s.userId }),
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
