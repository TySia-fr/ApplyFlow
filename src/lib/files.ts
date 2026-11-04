/**
 * Upload validation. The browser-supplied MIME type and file name are
 * attacker-controlled, so the type is decided from the file's first bytes.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type AllowedType = {
  mime: string;
  ext: string;
};

const PDF: AllowedType = { mime: "application/pdf", ext: "pdf" };
const DOCX: AllowedType = {
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ext: "docx",
};
const PNG: AllowedType = { mime: "image/png", ext: "png" };
const JPEG: AllowedType = { mime: "image/jpeg", ext: "jpg" };

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string, limit: number): boolean {
  const n = new TextEncoder().encode(needle);
  const end = Math.min(bytes.length, limit) - n.length;
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** Returns the detected type, or null if the content is not an allowed format. */
export function sniffType(bytes: Uint8Array): AllowedType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return PDF; // "%PDF-"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  // DOCX is a ZIP whose entries include "word/". A plain ZIP or an .xlsx is rejected.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(bytes, "word/", 64 * 1024)) return DOCX;
  return null;
}

/** Safe filename for Content-Disposition: ASCII, no path or quote characters. */
export function safeFilename(title: string, ext: string): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[^a-zA-Z0-9 ._-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "document";
  return `${base}.${ext}`;
}

export function extensionForMime(mime: string): string {
  return [PDF, DOCX, PNG, JPEG].find((t) => t.mime === mime)?.ext ?? "bin";
}
