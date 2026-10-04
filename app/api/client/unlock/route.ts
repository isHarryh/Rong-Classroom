import { createUnlockToken, matchesSecret, setUnlockCookie } from "@/lib/auth";
import { getClient, getDb } from "@/lib/db";
import { attemptLogin, jsonError, readJson, requireSession, route } from "@/lib/api";
import { clientIp } from "@/lib/ratelimit";
import { NextResponse } from "next/server";

export const POST = route(async (request: Request) => {
  const session = await requireSession("client");
  const db = getDb();
  const keys = [session.sub, `ip:${clientIp(request)}`];
  return attemptLogin(
    keys,
    async () => {
      const client = getClient(db, session.sub);
      const body = await readJson<{ secret?: string }>(request);
      return client && matchesSecret(String(body.secret || ""), client.secret) ? true : null;
    },
    async () => {
      const response = NextResponse.json({ ok: true });
      setUnlockCookie(response, await createUnlockToken(session));
      return response;
    },
    () => jsonError("密码错误", 403),
  );
});
