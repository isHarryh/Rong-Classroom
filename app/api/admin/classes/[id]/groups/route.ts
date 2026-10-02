import { NextResponse } from "next/server";
import { STATUS, getDb, moveSortedRow, nextSortId, parseStatus } from "@/lib/db";
import { jsonError, readJson, requireClassSession, route } from "@/lib/api";

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: classId } = await params;
  await requireClassSession(classId);
  const body = await readJson<Record<string, unknown>>(request);
  const db = getDb();
  if (body.action === "create") {
    const name = String(body.name || "").trim();
    if (!name) return jsonError("请输入组名");
    db.prepare(
      "INSERT INTO groups_table (id, name, sort_id, class_id, status, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    ).run(crypto.randomUUID(), name, nextSortId(db, "groups_table", classId), classId, Date.now());
  } else if (body.action === "update") {
    const name = String(body.name || "").trim();
    if (!name || !body.groupId) return jsonError("组别信息无效");
    db.prepare("UPDATE groups_table SET name = ? WHERE id = ? AND class_id = ?").run(
      name,
      String(body.groupId),
      classId,
    );
  } else if (body.action === "status") {
    if (!body.groupId) return jsonError("组别状态无效");
    const status = parseStatus(body.status);
    if (status === undefined) return jsonError("组别状态无效");
    const groupId = String(body.groupId);
    const update = db.transaction(() => {
      db.prepare("UPDATE groups_table SET status = ? WHERE id = ? AND class_id = ?").run(status, groupId, classId);
      if (status === STATUS.DELETED)
        db.prepare("UPDATE students SET group_id = NULL WHERE group_id = ? AND class_id = ?").run(groupId, classId);
    });
    update();
  } else if (body.action === "move") {
    const groupId = String(body.groupId || "");
    if (!db.prepare("SELECT id FROM groups_table WHERE id = ? AND class_id = ?").get(groupId, classId))
      return jsonError("组别不存在");
    moveSortedRow(db, "groups_table", groupId, body.direction === "up" ? -1 : 1);
  } else return jsonError("不支持的组别操作");
  return NextResponse.json({ ok: true });
});
