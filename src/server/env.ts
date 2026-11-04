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
    // "local" = private directory on disk (single server); "s3" = any S3-compatible store.
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_DIR: z.string().default("./storage"),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    // Demo sandboxes per IP per hour.
    DEMO_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(5),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
  })
  .refine(
    (e) =>
      e.STORAGE_DRIVER !== "s3" ||
      Boolean(e.S3_ENDPOINT && e.S3_REGION && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY),
    { message: "All S3_* variables are required when STORAGE_DRIVER=s3", path: ["STORAGE_DRIVER"] },
  )
  .refine((e) => !e.RESEND_API_KEY || e.EMAIL_FROM, {
    message: "EMAIL_FROM is required when RESEND_API_KEY is set",
    path: ["EMAIL_FROM"],
  });

// `KEY=` in a .env file means "unset", not "empty string".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  // Print field names only; never echo values (they may be secrets).
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
}

export const env = parsed.data;

/** Email is optional. Features that need it must check this, not assume. */
export const emailEnabled = Boolean(env.RESEND_API_KEY);
