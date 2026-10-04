import { NextResponse } from "next/server";
import { jsonError, readJson, requireSession, route } from "@/lib/api";
import { assignStudentGroup, getDb } from "@/lib/db";

export const POST = route(async (request: Request) => {
  const session = await requireSession("client");
  const classId = session.classId || "";
  const body = await readJson<{ studentId?: unknown; groupId?: unknown }>(request);
  const studentId = String(body.studentId || "");
  if (!studentId) return jsonError("学生参数无效");
  let groupId: string | null;
  if (body.groupId === null) groupId = null;
  else if (typeof body.groupId === "string") groupId = body.groupId;
  else return jsonError("组别参数无效");
  const result = assignStudentGroup(getDb(), classId, studentId, groupId);
  if (result === "group-missing") return jsonError("组别不存在或已停用", 404);
  if (result === "student-missing") return jsonError("学生不存在或已停用", 404);
  return NextResponse.json({ ok: true });
});
