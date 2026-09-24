// Who is looking at a server-rendered page: the guest cookie and/or a verified customer session.
import { cookies } from "next/headers";
import { customerFromSession, SESSION_COOKIE } from "./auth";
import type { Db } from "./db/client";
import { findGuest, GUEST_COOKIE } from "./guest";
import type { Viewer } from "./orders";

export async function currentViewer(db: Db): Promise<Viewer> {
  const jar = await cookies();
  const [guest, customerId] = await Promise.all([findGuest(db, jar.get(GUEST_COOKIE)?.value), customerFromSession(db, jar.get(SESSION_COOKIE)?.value)]);
  return { guestId: guest?.id ?? null, customerId };
}
