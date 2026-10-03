import { NextResponse } from "next/server";
import { jsonError, readJson, requireSession, route } from "@/lib/api";
import { getDb } from "@/lib/db";

export const POST = route(async (request: Request) => {
  const session = await requireSession("client");
  const classId = session.classId || "";
  const body = await readJson<{ studentId?: unknown; groupId?: unknown }>(request);
  const studentId = String(body.studentId || "");
  if (!studentId) return jsonError("学生参数无效");
  if (body.groupId !== null && typeof body.groupId !== "string") return jsonError("组别参数无效");
  const groupId = body.groupId;
  const db = getDb();
  const student = db
    .prepare("SELECT id FROM students WHERE id = ? AND class_id = ? AND status = 1")
    .get(studentId, classId);
  if (!student) return jsonError("学生不存在或已停用", 404);
  if (groupId) {
    const group = db
      .prepare("SELECT id FROM groups_table WHERE id = ? AND class_id = ? AND status = 1")
      .get(groupId, classId);
    if (!group) return jsonError("组别不存在或已停用", 404);
  }
  db.prepare("UPDATE students SET group_id = ? WHERE id = ?").run(groupId, studentId);
  return NextResponse.json({ ok: true });
});
