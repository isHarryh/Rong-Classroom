import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSuperAdmin } from "@/lib/auth";
import { STATUS, getDb, parseStatus } from "@/lib/db";
import { jsonError, readJson, requireSuperAdmin, route } from "@/lib/api";

export const GET = route(async () => {
  await requireSuperAdmin();
  const accounts = getDb()
    .prepare("SELECT id, name, username, role, status, created_at AS createdAt FROM teachers ORDER BY created_at")
    .all();
  return NextResponse.json({ accounts });
});

export const POST = route(async (request: Request) => {
  await requireSuperAdmin();
  const body = await readJson<Record<string, unknown>>(request);
  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!name || !username || password.length < 6) return jsonError("请填写姓名、用户名和至少 6 位密码");
  if (username === getSuperAdmin().username) return jsonError("该用户名由超级管理员保留");
  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO teachers (id, name, username, password, role, status, created_at) VALUES (?, ?, ?, ?, 0, 1, ?)",
    ).run(crypto.randomUUID(), name, username, await bcrypt.hash(password, 10), Date.now());
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return jsonError("用户名已存在");
    throw error;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
});

export const PATCH = route(async (request: Request) => {
  const session = await requireSuperAdmin();
  const body = await readJson<Record<string, unknown>>(request);
  const id = String(body.id || "");
  const db = getDb();
  if (!db.prepare("SELECT id FROM teachers WHERE id = ?").get(id)) return jsonError("账号不存在", 404);
  if (body.action === "status") {
    const status = parseStatus(body.status);
    if (status === undefined || status === STATUS.DELETED) return jsonError("账号状态无效");
    if (id === session.sub) return jsonError("不能禁用当前账号");
    db.prepare("UPDATE teachers SET status = ? WHERE id = ?").run(status, id);
  } else {
    if (body.action !== undefined) return jsonError("不支持的账号操作");
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!name) return jsonError("姓名不能为空");
    if (password && password.length < 6) return jsonError("密码至少 6 位");
    if (password)
      db.prepare("UPDATE teachers SET name = ?, password = ? WHERE id = ?").run(
        name,
        await bcrypt.hash(password, 10),
        id,
      );
    else db.prepare("UPDATE teachers SET name = ? WHERE id = ?").run(name, id);
  }
  return NextResponse.json({ ok: true });
});
