import { NextResponse } from "next/server";
import { jsonError, requireSession, route } from "@/lib/api";
import { getDb, getOrderedReasons, getClassBundle, getPetEnabled, touchClient } from "@/lib/db";
import { petDayStart } from "@/lib/pets";

export const GET = route(async () => {
  const session = await requireSession("client");
  const db = getDb();
  const client = db
    .prepare(
      "SELECT c.id, c.code, c.class_id AS classId, cl.name AS className FROM clients c JOIN classes cl ON cl.id = c.class_id WHERE c.id = ?",
    )
    .get(session.sub) as { id: string; code: string; classId: string; className: string } | undefined;
  if (!client) return jsonError("设备不存在", 404);
  touchClient(db, client.id);
  const reasons = getOrderedReasons(db, true);
  const petEnabled = getPetEnabled(db);
  const bundle = getClassBundle(db, client.classId, false, petEnabled);
  if (!petEnabled) {
    return NextResponse.json({
      client,
      class: { id: client.classId, name: client.className },
      reasons,
      petEnabled: false,
      students: bundle.students,
      groups: bundle.groups,
    });
  }
  const dayStart = petDayStart();
  return NextResponse.json({
    client,
    class: { id: client.classId, name: client.className },
    reasons,
    petEnabled: true,
    petThresholds: bundle.petThresholds,
    students: bundle.students.map(student => ({
      ...student,
      canChangeToday: !student.pet || student.pet.recruitedAt < dayStart,
    })),
    groups: bundle.groups,
  });
});
