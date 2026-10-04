import { NextResponse } from "next/server";
import { getDb, getOrderedReasons, moveSortedRow, nextSortId, parseStatus } from "@/lib/db";
import { jsonError, readJson, requireSession, requireSuperAdmin, route } from "@/lib/api";

export const GET = route(async () => {
  await requireSession("admin");
  return NextResponse.json({ reasons: getOrderedReasons(getDb()) });
});

export const POST = route(async (request: Request) => {
  await requireSuperAdmin();
  const body = await readJson<Record<string, unknown>>(request);
  const db = getDb();
  const action = String(body.action || "");
  if (action === "create") {
    const name = String(body.name || "").trim();
    const parentId = body.parentId ? String(body.parentId) : null;
    if (!name) return jsonError("请输入原因名称");
    if (parentId) {
      const parent = db
        .prepare("SELECT id, parent_id AS parentId FROM credit_reasons WHERE id = ? AND status != 2")
        .get(parentId) as { id: string; parentId: string | null } | undefined;
      if (!parent || parent.parentId) return jsonError("原因最多支持两级");
    }
    db.prepare(
      "INSERT INTO credit_reasons (id, sort_id, name, parent_id, status, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    ).run(crypto.randomUUID(), nextSortId(db, "credit_reasons", parentId), name, parentId, Date.now());
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (action === "update") {
    const name = String(body.name || "").trim();
    if (!name || !body.id) return jsonError("原因信息无效");
    const result = db.prepare("UPDATE credit_reasons SET name = ? WHERE id = ?").run(name, String(body.id));
    if (!result.changes) return jsonError("原因不存在", 404);
  } else if (action === "status") {
    if (!body.id) return jsonError("原因状态无效");
    const status = parseStatus(body.status);
    if (status === undefined) return jsonError("原因状态无效");
    const id = String(body.id);
    let missing = false;
    const update = db.transaction(() => {
      const result = db.prepare("UPDATE credit_reasons SET status = ? WHERE id = ?").run(status, id);
      if (!result.changes) {
        missing = true;
        return;
      }
      db.prepare("UPDATE credit_reasons SET status = ? WHERE parent_id = ?").run(status, id);
    });
    update();
    if (missing) return jsonError("原因不存在", 404);
  } else if (action === "move") {
    const id = String(body.id || "");
    if (!db.prepare("SELECT id FROM credit_reasons WHERE id = ?").get(id)) return jsonError("原因不存在", 404);
    moveSortedRow(db, "credit_reasons", id, body.direction === "up" ? -1 : 1);
  } else return jsonError("不支持的原因操作");
  return NextResponse.json({ ok: true });
});
