import { NextResponse } from "next/server";
import { createUnlockToken, isUnlocked, setUnlockCookie } from "@/lib/auth";
import { requireSession, route } from "@/lib/api";

export const POST = route(async () => {
  const session = await requireSession("client");
  const response = NextResponse.json({ ok: true });
  if (await isUnlocked(session)) setUnlockCookie(response, await createUnlockToken(session));
  return response;
});
