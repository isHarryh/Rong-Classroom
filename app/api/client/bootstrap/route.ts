import { NextResponse } from "next/server";
import { jsonError, requireSession, route } from "@/lib/api";
import { getDb, getOrderedReasons, getClassBundle, touchClient } from "@/lib/db";

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
  return NextResponse.json({
    client,
    class: { id: client.classId, name: client.className },
    reasons,
    ...getClassBundle(db, client.classId),
  });
});
