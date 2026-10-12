import { NextResponse } from "next/server";
import { jsonError, readJson, requireClassSession, route } from "@/lib/api";
import { getDb, getPetEnabled, savePet } from "@/lib/db";
import { isPetSpecies, PET_SPECIES } from "@/lib/pets";

function shuffle<T>(items: readonly T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Admin pet operations: "random" fills pet-less enabled students with a shuffled
// even spread of species; "change" sets one student's pet. Quota rules do not
// apply here, but recruited_at is refreshed so the classroom sees the change.
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireClassSession(id);
  const db = getDb();
  if (!getPetEnabled(db)) return jsonError("宠物系统已全局关闭", 403);
  const body = await readJson<{ action?: string; studentId?: string; species?: string }>(request);
  if (body.action === "random") {
    const students = db
      .prepare(
        `SELECT s.id FROM students s LEFT JOIN pets p ON p.student_id = s.id
         WHERE s.class_id = ? AND s.status = 1 AND p.id IS NULL`,
      )
      .all(id) as { id: string }[];
    if (students.length) {
      const speciesPool = shuffle(PET_SPECIES.map(species => species.id));
      const now = Date.now();
      const run = db.transaction(() => {
        students.forEach((student, index) => {
          savePet(db, id, student.id, speciesPool[index % speciesPool.length], now);
        });
      });
      run();
    }
    return NextResponse.json({ count: students.length });
  }
  if (body.action === "change") {
    const studentId = String(body.studentId || "");
    const species = String(body.species || "");
    if (!isPetSpecies(species)) return jsonError("宠物物种无效");
    const student = db
      .prepare("SELECT id FROM students WHERE id = ? AND class_id = ? AND status = 1")
      .get(studentId, id);
    if (!student) return jsonError("学生不存在或不可操作", 404);
    return NextResponse.json({ pet: savePet(db, id, studentId, species) });
  }
  return jsonError("不支持的操作");
});
