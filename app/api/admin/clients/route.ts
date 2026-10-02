import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getDb, type Db, parseStatus } from "@/lib/db";
import { canAccessClass, jsonError, ownerScope, readJson, requireSession, route } from "@/lib/api";

function makeCode(db: Db) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (;;) {
    const code = Array.from({ length: 6 }, () => letters[randomInt(letters.length)]).join("");
    if (!db.prepare("SELECT id FROM clients WHERE code = ?").get(code)) return code;
  }
}

export const GET = route(async (request: Request) => {
  const session = await requireSession("admin");
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true";
  const scope = ownerScope(session, "cl");
  const clients = getDb()
    .prepare(
      `
    SELECT c.id, c.code, c.secret, c.class_id AS classId, c.status, c.active_at AS activeAt, c.created_at AS createdAt, cl.name AS className
    FROM clients c JOIN classes cl ON cl.id = c.class_id
    WHERE ${scope.clause} ${includeDeleted ? "" : "AND c.status != 2 AND cl.status != 2"} ORDER BY c.created_at DESC
  `,
    )
    .all(...scope.args);
  return NextResponse.json({ clients });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession("admin");
  const body = await readJson<Record<string, unknown>>(request);
  const classId = String(body.classId || "");
  const secret = String(body.secret || "");
  if (!classId || !/^\d{6}$/.test(secret) || !canAccessClass(session, classId))
    return jsonError("请选择班级并设置 6 位数字解锁密码");
  const db = getDb();
  const id = crypto.randomUUID();
  const code = makeCode(db);
  db.prepare("INSERT INTO clients (id, code, secret, class_id, status, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(
    id,
    code,
    secret,
    classId,
    Date.now(),
  );
  return NextResponse.json({ client: { id, code, classId, secret } }, { status: 201 });
});

export const PATCH = route(async (request: Request) => {
  const session = await requireSession("admin");
  const body = await readJson<Record<string, unknown>>(request);
  const id = String(body.id || "");
  const db = getDb();
  const scope = ownerScope(session, "cl");
  const client = db
    .prepare(
      `SELECT c.id, c.class_id AS classId, cl.status AS classStatus FROM clients c JOIN classes cl ON cl.id = c.class_id WHERE c.id = ? AND ${scope.clause}`,
    )
    .get(id, ...scope.args) as { id: string; classId: string; classStatus: number } | undefined;
  if (!client) return jsonError("设备不存在或无权访问", 404);
  if (body.action === "status") {
    const status = parseStatus(body.status);
    if (status === undefined) return jsonError("设备状态无效");
    if (status === 1 && client.classStatus === 2) return jsonError("班级已删除，无法恢复该设备");
    db.prepare("UPDATE clients SET status = ? WHERE id = ?").run(status, id);
  } else {
    if (body.action !== undefined) return jsonError("不支持的设备操作");
    const secret = String(body.secret || "");
    if (!/^\d{6}$/.test(secret)) return jsonError("解锁密码必须为 6 位数字");
    db.prepare("UPDATE clients SET secret = ? WHERE id = ?").run(secret, id);
  }
  return NextResponse.json({ ok: true });
});
