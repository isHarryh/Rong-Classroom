import { NextResponse } from "next/server";
import { createUnlockToken, matchesSecret, setUnlockCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { jsonError, readJson, requireSession, route } from "@/lib/api";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/ratelimit";

export const POST = route(async (request: Request) => {
  const session = await requireSession("client");
  if (isRateLimited(session.sub)) return jsonError("尝试过于频繁，请稍后再试", 429);
  const body = await readJson<{ secret?: string }>(request);
  const client = getDb().prepare("SELECT secret FROM clients WHERE id = ?").get(session.sub) as
    { secret: string } | undefined;
  if (!client || !matchesSecret(String(body.secret || ""), client.secret)) {
    recordFailure(session.sub);
    return jsonError("密码错误", 403);
  }
  clearFailures(session.sub);
  const result = NextResponse.json({ ok: true });
  setUnlockCookie(result, await createUnlockToken(session));
  return result;
});
