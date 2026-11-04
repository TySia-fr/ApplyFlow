import { z } from "zod";
import { getCurrentUserOrNull } from "@/server/auth/current-user";
import { NotFoundError } from "@/server/errors";
import { log } from "@/server/logger";
import { readDocument } from "@/server/services/documents";
import { extensionForMime, safeFilename } from "@/lib/files";

/**
 * Authorized download. Streams the bytes from private storage only to the
 * owner. Always `attachment` with a server-chosen type and `nosniff`, so an
 * uploaded file can never execute in the app's origin.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUserOrNull();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  try {
    const { doc, bytes } = await readDocument(user.id, id);
    const name = safeFilename(doc.title, extensionForMime(doc.mimeType));
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      log.security("authz.document_denied", { userId: user.id });
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
}
