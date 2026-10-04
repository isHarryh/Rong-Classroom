import { NextResponse } from "next/server";
import { SUPERADMIN_SUB, getSession, type Session } from "./auth";
import { getDb } from "./db";
import { beginAttempt, clearFailures } from "./ratelimit";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export function route<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) return jsonError(error.message, error.status);
      throw error;
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "请求体格式无效");
  }
}

export function readIncludeDeleted(request: Request) {
  return new URL(request.url).searchParams.get("includeDeleted") === "true";
}

export type Term = { termYear: number; termNum: number };

export function validateTerm(input: { termYear?: unknown; termNum?: unknown }): Term | undefined {
  const termYear = Number(input.termYear);
  const termNum = Number(input.termNum);
  if (!Number.isInteger(termYear) || termYear < 2000 || termYear > new Date().getFullYear() + 3) return undefined;
  if (termNum !== 1 && termNum !== 2) return undefined;
  return { termYear, termNum };
}

// Shared skeleton for credential checks (login and unlock): count the attempt up
// front so concurrent requests cannot slip past the limit, then verify and either
// clear the counter and succeed, or fail without extra bookkeeping.
export async function attemptLogin<S>(
  keys: string[],
  verify: () => Promise<S | null> | S | null,
  succeed: (value: S) => Promise<Response> | Response,
  fail: () => Response,
): Promise<Response> {
  if (!beginAttempt(keys)) return jsonError("尝试过于频繁，请稍后再试", 429);
  const value = await verify();
  if (value === null) return fail();
  for (const key of keys) clearFailures(key);
  return succeed(value);
}

export function isActiveSession(session: Session) {
  const db = getDb();
  if (session.kind === "admin") {
    if (session.sub === SUPERADMIN_SUB) return session.role === 1;
    return Boolean(db.prepare("SELECT id FROM teachers WHERE id = ? AND status = 1").get(session.sub));
  }
  return Boolean(
    db
      .prepare(
        "SELECT c.id FROM clients c JOIN classes cl ON cl.id = c.class_id WHERE c.id = ? AND c.status = 1 AND cl.status = 1",
      )
      .get(session.sub),
  );
}

export async function requireSession(kind?: "admin" | "client"): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "请先登录");
  if (kind && session.kind !== kind) throw new HttpError(403, "没有权限执行此操作");
  if (!isActiveSession(session)) throw new HttpError(401, "账号或设备已停用");
  return session;
}

export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireSession("admin");
  if (session.role !== 1) throw new HttpError(403, "仅超级管理员可执行此操作");
  return session;
}

export type ClassRow = {
  id: string;
  name: string;
  termYear: number;
  termNum: number;
  status: number;
};

export function getAccessibleClass(session: Session, classId: string, includeDeleted = false) {
  const db = getDb();
  const clause = session.role === 1 ? "id = ?" : "id = ? AND owner_id = ?";
  return db
    .prepare(
      `SELECT id, name, term_year AS termYear, term_num AS termNum, status FROM classes WHERE ${clause}${includeDeleted ? "" : " AND status != 2"}`,
    )
    .get(...(session.role === 1 ? [classId] : [classId, session.sub])) as ClassRow | undefined;
}

export function canAccessClass(session: Session, classId: string) {
  return session.kind === "admin" && Boolean(getAccessibleClass(session, classId));
}

export async function requireClassSession(classId: string, includeDeleted = false) {
  const session = await requireSession("admin");
  const cls = getAccessibleClass(session, classId, includeDeleted);
  if (!cls) throw new HttpError(404, "班级不存在或无权访问");
  return { session, class: cls };
}

export function ownerScope(session: Session, column: string) {
  return session.role === 1
    ? { clause: "1 = 1", args: [] as (string | number)[] }
    : { clause: `${column}.owner_id = ?`, args: [session.sub] };
}
