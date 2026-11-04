import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

// Keys that must never reach logs, even if a caller passes them by mistake.
const REDACT = /pass(word)?|secret|token|authorization|cookie|key/i;

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

/**
 * One JSON object per line on stdout/stderr: what Docker, journald and any log
 * shipper expect. No dependency, no transport to configure.
 */
function write(level: Level, msg: string, fields: Fields = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(fields) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Fields) => write("debug", msg, f),
  info: (msg: string, f?: Fields) => write("info", msg, f),
  warn: (msg: string, f?: Fields) => write("warn", msg, f),
  error: (msg: string, f?: Fields) => write("error", msg, f),
  /** Security-relevant events get a stable `event` field for filtering. */
  security: (event: string, f?: Fields) => write("warn", "security", { event, ...f }),
};

export function errorFields(err: unknown): Fields {
  return err instanceof Error ? { error: err.message, stack: err.stack } : { error: String(err) };
}
