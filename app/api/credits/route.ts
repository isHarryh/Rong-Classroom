import { NextResponse } from "next/server";
import { createUnlockToken, isUnlocked, setUnlockCookie } from "@/lib/auth";
import { canAccessClass, jsonError, readJson, requireSession, route } from "@/lib/api";
import { getDb } from "@/lib/db";

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  if (session.kind === "client" && !(await isUnlocked(session))) return jsonError("设备仍处于锁定状态，请先解锁", 423);
  const body = await readJson<{
    classId?: string;
    studentIds?: string[];
    reasonId?: string;
    delta?: number;
  }>(request);
  const classId = session.kind === "client" ? session.classId || "" : String(body.classId || "");
  if (!classId || (session.kind === "admin" && !canAccessClass(session, classId)))
    return jsonError("班级不存在或无权访问", 404);
  const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.map(String).filter(Boolean))] : [];
  const delta = Number(body.delta);
  if (!studentIds.length) return jsonError("尚未选择学生");
  if (studentIds.length > 500) return jsonError("单次操作学生数量过多");
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10) return jsonError("分值必须为 1 至 10 的整数");
  if (!body.reasonId) return jsonError("请选择加减分原因");
  const db = getDb();
  const reason = db.prepare("SELECT id, name, status FROM credit_reasons WHERE id = ?").get(String(body.reasonId)) as
    { id: string; name: string; status: number } | undefined;
  if (!reason || reason.status !== 1) return jsonError("加减分原因不可用");
  const clientId = session.kind === "client" ? session.sub : null;
  const now = Date.now();
  const insert = db.prepare(
    "INSERT INTO credit_records (id, student_id, reason_id, reason_name, group_name, delta, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let count = 0;
  const run = db.transaction(() => {
    for (const studentId of studentIds) {
      const student = db
        .prepare(
          `SELECT s.id, g.name AS groupName FROM students s LEFT JOIN groups_table g ON g.id = s.group_id WHERE s.id = ? AND s.class_id = ? AND s.status = 1`,
        )
        .get(studentId, classId) as { id: string; groupName?: string } | undefined;
      if (!student) continue;
      insert.run(
        crypto.randomUUID(),
        student.id,
        reason.id,
        reason.name,
        student.groupName || "未分组",
        delta,
        clientId,
        now,
      );
      count++;
    }
  });
  run();
  if (!count) return jsonError("没有可操作的启用学生");
  const response = NextResponse.json({ count });
  if (session.kind === "client") setUnlockCookie(response, await createUnlockToken(session));
  return response;
});
