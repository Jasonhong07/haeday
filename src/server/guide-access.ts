// CC4b: who may see a guide page. Published pages: everyone. Drafts: admins only (preview), everyone else 404.
import type { Guide } from "@/content/guides";
import { guideBySlug, isPublished } from "@/lib/guides";
import { isAdmin } from "./auth";
import { serverContext } from "./http";
import { currentViewer } from "./viewer";

export async function viewableGuide(slug: string): Promise<{ guide: Guide; preview: boolean } | null> {
  const guide = guideBySlug(slug);
  if (!guide) return null;
  if (isPublished(guide)) return { guide, preview: false };
  return (await viewerIsAdmin()) ? { guide, preview: true } : null;
}

/** False (never an error page) when the database or keys are unavailable. */
export async function viewerIsAdmin(): Promise<boolean> {
  try {
    const ctx = serverContext();
    const v = await currentViewer(ctx.db);
    return await isAdmin(ctx.db, ctx.ring, v.customerId, ctx.env.ADMIN_EMAILS);
  } catch { return false; }
}
