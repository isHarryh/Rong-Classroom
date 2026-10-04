import { NextResponse } from "next/server";
import { createUnlockToken, isUnlocked, setUnlockCookie } from "@/lib/auth";
import { requireSession, route } from "@/lib/api";
import { getDb, touchClient } from "@/lib/db";

export const POST = route(async () => {
  const session = await requireSession("client");
  const db = getDb();
  touchClient(db, session.sub);
  const response = NextResponse.json({ ok: true });
  if (await isUnlocked(session)) setUnlockCookie(response, await createUnlockToken(session));
  return response;
});
