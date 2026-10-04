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
import { type Db, getClientByCode, getDb, touchClient } from "@/lib/db";
import { attemptLogin, jsonError, readJson, route } from "@/lib/api";
import { clientIp } from "@/lib/ratelimit";

// bcrypt target for unknown usernames so every request pays the same hashing cost
// and usernames cannot be probed by timing.
const DUMMY_PASSWORD_HASH = "$2b$10$lJ3DCIfJr7tgVK2B5g6Dauyv95HpfqXtLmBWkiFs/HBY.oa4AKzDm";

const LONG_SESSION_MS = 3650 * 24 * 60 * 60 * 1000;

type AdminPayload = { sub: string; name: string; username: string; role: number };

async function issueAdminSession(payload: AdminPayload) {
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

async function loginAdmin(db: Db, body: Record<string, unknown>, ipKey: string) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  return attemptLogin(
    [`admin:${username}`, ipKey],
    async () => {
      const superAdmin = getSuperAdmin();
      if (username === superAdmin.username) {
        if (!matchesSecret(password, superAdmin.password)) return null;
        return { sub: SUPERADMIN_SUB, name: superAdmin.name, username, role: 1 };
      }
      const teacher = db
        .prepare("SELECT id, name, username, password, role, status FROM teachers WHERE username = ?")
        .get(username) as
        { id: string; name: string; username: string; password: string; role: number; status: number } | undefined;
      const passwordMatches = await bcrypt.compare(password, teacher?.password || DUMMY_PASSWORD_HASH);
      if (!teacher || teacher.status !== 1 || !passwordMatches) return null;
      return { sub: teacher.id, name: teacher.name, username: teacher.username, role: teacher.role };
    },
    issueAdminSession,
    () => jsonError("用户名或密码错误", 401),
  );
}

function loginClient(db: Db, body: Record<string, unknown>, ipKey: string) {
  const code = String(body.code || "")
    .trim()
    .toUpperCase();
  const secret = String(body.secret || "");
  return attemptLogin(
    [`client:${code}`, ipKey],
    () => {
      const client = getClientByCode(db, code);
      return client && client.status === 1 && client.classStatus === 1 && matchesSecret(secret, client.secret)
        ? client
        : null;
    },
    async client => {
      const rawExpiresAt = body.expiresAt;
      let expiresAt: number;
      if (rawExpiresAt === undefined || rawExpiresAt === "long") expiresAt = Date.now() + LONG_SESSION_MS;
      else if (typeof rawExpiresAt === "number" && Number.isFinite(rawExpiresAt)) expiresAt = rawExpiresAt;
      else if (typeof rawExpiresAt === "string" && /^\d+$/.test(rawExpiresAt)) expiresAt = Number(rawExpiresAt);
      else return jsonError("设备登录到期时间无效");
      if (expiresAt <= Date.now()) return jsonError("设备登录到期时间无效");
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
      // Keep the cookie at least a minute; small clock skew should not drop a valid session.
      setSessionCookie(response, token, Math.max(60, Math.floor((expiresAt - Date.now()) / 1000)));
      return response;
    },
    () => jsonError("设备码、解锁密码或绑定班级无效", 401),
  );
}

export const POST = route(async (request: Request) => {
  const body = await readJson<Record<string, unknown>>(request);
  const rawType = body.type;
  if (rawType !== undefined && rawType !== "admin" && rawType !== "client") return jsonError("登录类型无效");
  const db = getDb();
  const ipKey = `ip:${clientIp(request)}`;
  if (rawType === "client") return loginClient(db, body, ipKey);
  return loginAdmin(db, body, ipKey);
});
