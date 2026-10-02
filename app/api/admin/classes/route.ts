import { NextResponse } from "next/server";
import { STATUS, getDb } from "@/lib/db";
import { jsonError, ownerScope, readJson, requireSession, route } from "@/lib/api";

export const GET = route(async (request: Request) => {
  const session = await requireSession("admin");
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true";
  const scope = ownerScope(session, "c");
  const rows = getDb()
    .prepare(
      `
    SELECT c.id, c.name, c.term_year AS termYear, c.term_num AS termNum, c.status, c.created_at AS createdAt,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 1) AS studentCount,
      (SELECT COUNT(*) FROM groups_table g WHERE g.class_id = c.id AND g.status = 1) AS groupCount
    FROM classes c WHERE ${scope.clause} ${includeDeleted ? "" : "AND c.status != 2"} ORDER BY c.created_at DESC
  `,
    )
    .all(...scope.args);
  return NextResponse.json({ classes: rows });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession("admin");
  const body = await readJson<Record<string, unknown>>(request);
  const name = String(body.name || "").trim();
  const termYear = Number(body.termYear);
  const termNum = Number(body.termNum);
  if (!name || !Number.isInteger(termYear) || !Number.isInteger(termNum) || termNum < 1 || termNum > 2)
    return jsonError("请填写完整且有效的班级信息");
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO classes (id, name, term_year, term_num, owner_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, name, termYear, termNum, session.role === 1 ? null : session.sub, STATUS.ENABLED, Date.now());
  return NextResponse.json({ id }, { status: 201 });
});
