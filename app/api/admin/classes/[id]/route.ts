import { NextResponse } from "next/server";
import { getClassBundle, getDb, parseStatus } from "@/lib/db";
import { jsonError, readJson, requireClassSession, route } from "@/lib/api";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const { class: classInfo } = await requireClassSession(id, true);
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true";
  return NextResponse.json({
    class: classInfo,
    ...getClassBundle(getDb(), id, includeDeleted),
  });
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireClassSession(id, true);
  const body = await readJson<Record<string, unknown>>(request);
  const db = getDb();
  if (body.action === "status") {
    const status = parseStatus(body.status);
    if (status === undefined) return jsonError("状态无效");
    const update = db.transaction(() => {
      db.prepare("UPDATE classes SET status = ? WHERE id = ?").run(status, id);
      if (status === 2) db.prepare("UPDATE clients SET status = 2 WHERE class_id = ?").run(id);
    });
    update();
  } else {
    if (body.action !== undefined) return jsonError("不支持的班级操作");
    const name = String(body.name || "").trim();
    const termYear = Number(body.termYear);
    const termNum = Number(body.termNum);
    if (!name || !Number.isInteger(termYear) || ![1, 2].includes(termNum)) return jsonError("班级信息无效");
    db.prepare("UPDATE classes SET name = ?, term_year = ?, term_num = ? WHERE id = ?").run(
      name,
      termYear,
      termNum,
      id,
    );
  }
  return NextResponse.json({ ok: true });
});
