import { NextResponse } from "next/server";
import { jsonError, readJson, requireSession, route } from "@/lib/api";
import { getDb, getPet, getPetEnabled, getStudentGrowth, savePet } from "@/lib/db";
import { isPetSpecies, petDayStart } from "@/lib/pets";

// Classroom-side pet selection / change. No unlock is required: switching the
// species keeps the current stage and growth, and the daily change limit per
// student is the only restriction.
export const POST = route(async (request: Request) => {
  const session = await requireSession("client");
  const body = await readJson<{ studentId?: string; species?: string }>(request);
  const studentId = String(body.studentId || "");
  const species = String(body.species || "");
  const db = getDb();
  if (!getPetEnabled(db)) return jsonError("宠物系统已关闭", 403);
  if (!isPetSpecies(species)) return jsonError("宠物物种无效");
  const classId = session.classId || "";
  const student = db
    .prepare("SELECT id FROM students WHERE id = ? AND class_id = ? AND status = 1")
    .get(studentId, classId);
  if (!student) return jsonError("学生不存在或不可操作", 404);
  const existing = getPet(db, studentId);
  const now = Date.now();
  if (existing && existing.recruitedAt >= petDayStart(now)) return jsonError("今日已更换过宠物，请明天再试", 409);
  const pet = savePet(db, classId, studentId, species, now);
  return NextResponse.json({ pet, growth: getStudentGrowth(db, studentId) });
});
