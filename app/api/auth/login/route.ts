import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  SESSION_TTL_SECONDS,
  SUPERADMIN_SUB,
  createSession,
  getSuperAdmin,
  matchesSecret,
  setSessionCookie,
} from "@/lib/auth";
import { getDb, touchClient } from "@/lib/db";
import { jsonError, readJson, route } from "@/lib/api";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/ratelimit";

const DUMMY_PASSWORD_HASH = "$2b$10$lJ3DCIfJr7tgVK2B5g6Dauyv95HpfqXtLmBWkiFs/HBY.oa4AKzDm";

async function issueAdminSession(payload: { sub: string; name: string; username: string; role: number }) {
  const token = await createSession({ ...payload, kind: "admin" });
  const response = NextResponse.json({
    kind: "admin",
    name: payload.name,
    username: payload.username,
    role: payload.role,
  });
  setSessionCookie(response, token, SESSION_TTL_SECONDS);
  return response;
}

export const POST = route(async (request: Request) => {
  const body = await readJson<Record<string, unknown>>(request);
  const type = body.type === "client" ? "client" : "admin";
  const db = getDb();

  if (type === "admin") {
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const rateKey = `admin:${username}`;
    if (isRateLimited(rateKey)) return jsonError("尝试过于频繁，请稍后再试", 429);
    const superAdmin = getSuperAdmin();
    if (username === superAdmin.username) {
      if (!matchesSecret(password, superAdmin.password)) {
        recordFailure(rateKey);
        return jsonError("用户名或密码错误", 401);
      }
      clearFailures(rateKey);
      return issueAdminSession({ sub: SUPERADMIN_SUB, name: superAdmin.name, username, role: 1 });
    }
    const teacher = db
      .prepare("SELECT id, name, username, password, role, status FROM teachers WHERE username = ?")
      .get(username) as
      | {
          id: string;
          name: string;
          username: string;
          password: string;
          role: number;
          status: number;
        }
      | undefined;
    const passwordMatches = await bcrypt.compare(password, teacher?.password || DUMMY_PASSWORD_HASH);
    if (!teacher || teacher.status !== 1 || !passwordMatches) {
      recordFailure(rateKey);
      return jsonError("用户名或密码错误", 401);
    }
    clearFailures(rateKey);
    return issueAdminSession({
      sub: teacher.id,
      name: teacher.name,
      username: teacher.username,
      role: teacher.role,
    });
  }

  const code = String(body.code || "")
    .trim()
    .toUpperCase();
  const secret = String(body.secret || "");
  const rateKey = `client:${code}`;
  if (isRateLimited(rateKey)) return jsonError("尝试过于频繁，请稍后再试", 429);
  const client = db
    .prepare(
      `
    SELECT c.id, c.code, c.secret, c.class_id AS classId, c.status, cl.name AS className, cl.status AS classStatus
    FROM clients c JOIN classes cl ON cl.id = c.class_id WHERE c.code = ?
  `,
    )
    .get(code) as
    | {
        id: string;
        code: string;
        secret: string;
        classId: string;
        status: number;
        className: string;
        classStatus: number;
      }
    | undefined;
  if (!client || client.status !== 1 || client.classStatus !== 1 || !matchesSecret(secret, client.secret)) {
    recordFailure(rateKey);
    return jsonError("设备码、解锁密码或绑定班级无效", 401);
  }
  clearFailures(rateKey);
  const rawExpiresAt = body.expiresAt;
  const expiresAt =
    rawExpiresAt === "long" || rawExpiresAt === undefined
      ? Date.now() + 3650 * 24 * 60 * 60 * 1000
      : Number(rawExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return jsonError("设备登录到期时间无效", 400);
  touchClient(db, client.id);
  const token = await createSession(
    {
      sub: client.id,
      kind: "client",
      role: 0,
      name: client.className,
      classId: client.classId,
      clientCode: client.code,
    },
    expiresAt,
  );
  const response = NextResponse.json({
    kind: "client",
    className: client.className,
    code: client.code,
    expiresAt,
  });
  setSessionCookie(response, token, Math.max(60, Math.floor((expiresAt - Date.now()) / 1000)));
  return response;
});
