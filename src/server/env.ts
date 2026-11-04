import "server-only";
import { z } from "zod";

/**
 * Single source of truth for server configuration.
 * Parsed once at import; an invalid environment crashes at boot with a clear
 * message instead of failing later on the first request that needs a value.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.url().startsWith("postgres"),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().optional().transform((v) => v || undefined),
    EMAIL_FROM: z.string().optional().transform((v) => v || undefined),
  })
  .refine((e) => !e.RESEND_API_KEY || e.EMAIL_FROM, {
    message: "EMAIL_FROM is required when RESEND_API_KEY is set",
    path: ["EMAIL_FROM"],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print field names only; never echo values (they may be secrets).
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
}

export const env = parsed.data;

/** Email is optional. Features that need it must check this, not assume. */
export const emailEnabled = Boolean(env.RESEND_API_KEY);
