import "server-only";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Fetching a URL a user sent is a classic SSRF vector: "https://169.254.169.254/"
 * or a hostname that resolves to 127.0.0.1 would make the server read its own
 * internal services. Defences:
 *
 * 1. http/https on default ports only; no credentials in the URL.
 * 2. Every IP a hostname resolves to is checked against private, loopback,
 *    link-local, CGNAT, multicast and reserved ranges (v4 and v6).
 * 3. The check runs inside the socket's DNS lookup, so the address that was
 *    validated is the address that is connected to (no DNS-rebinding gap).
 * 4. Redirects are followed manually (max 3), each hop re-validated.
 * 5. 8 s timeout, 1 MB body cap, HTML only.
 */

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnsafeUrlError";
  }
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = v4ToInt(ip);
    return !V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (v === 6) {
    const a = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) → judge the embedded v4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped?.[1]) return isPublicIp(mapped[1]);
    if (a === "::" || a === "::1") return false;
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return false; // ff00::/8 multicast
    if (a.startsWith("64:ff9b:") || a.startsWith("2001:db8:") || a.startsWith("2001:0db8:")) return false;
    return true;
  }
  return false;
}

export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UnsafeUrlError("scheme");
  if (u.username || u.password) throw new UnsafeUrlError("credentials in URL");
  if (u.port && u.port !== "80" && u.port !== "443") throw new UnsafeUrlError("port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicIp(host)) throw new UnsafeUrlError("private address");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("private host");
  }
  return u;
}

/** DNS lookup that refuses to hand a non-public address to the socket. */
const guardedLookup: typeof lookup = ((hostname: string, options: unknown, callback: unknown) => {
  const cb = (typeof options === "function" ? options : callback) as (
    err: NodeJS.ErrnoException | null,
    address: string | { address: string; family: number }[],
    family?: number,
  ) => void;
  const opts = (typeof options === "object" && options ? options : {}) as { all?: boolean };
  lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const bad = addresses.find((a) => !isPublicIp(a.address));
    if (bad || addresses.length === 0) {
      return cb(Object.assign(new Error(`blocked address for ${hostname}`), { code: "EBLOCKED" }), "");
    }
    if (opts.all) return cb(null, addresses);
    const first = addresses[0]!;
    cb(null, first.address, first.family);
  });
}) as typeof lookup;

const agent = new Agent({ connect: { lookup: guardedLookup, timeout: 5_000 } });

const MAX_BYTES = 1024 * 1024;

export type FetchHtml = (url: string) => Promise<{ finalUrl: string; html: string }>;

export const fetchHtmlSafely: FetchHtml = async (rawUrl) => {
  let url = assertSafeUrl(rawUrl);
  const deadline = AbortSignal.timeout(8_000);
  for (let hop = 0; hop <= 3; hop++) {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      redirect: "manual",
      signal: deadline,
      headers: {
        "User-Agent": "ApplyFlowBot/1.0 (+https://applyflow.siavashizadi.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr,en;q=0.8",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new UnsafeUrlError("redirect without location");
      url = assertSafeUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      await res.body?.cancel();
      throw new Error("not HTML");
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break; // keep what we have: metadata lives in <head>
      }
      chunks.push(value);
    }
    return { finalUrl: url.toString(), html: Buffer.concat(chunks).toString("utf8") };
  }
  throw new UnsafeUrlError("too many redirects");
};
