import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonError, requireClassSession, route } from "@/lib/api";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: classId } = await params;
  await requireClassSession(classId);
  const search = new URL(request.url).searchParams;
  const page = Math.max(1, Math.floor(Number(search.get("page")) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(search.get("pageSize")) || 20)));
  const from = search.get("from") || undefined;
  const to = search.get("to") || undefined;
  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : undefined;
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : undefined;
  if ((from && fromTime === undefined) || (to && toTime === undefined)) return jsonError("日期格式无效");
  const filterType = search.get("type") || undefined;
  const where = ["s.class_id = ?"];
  const args: (string | number)[] = [classId];
  const studentId = search.get("studentId") || undefined;
  if (studentId) {
    where.push("r.student_id = ?");
    args.push(studentId);
  }
  const reasonId = search.get("reasonId") || undefined;
  if (reasonId) {
    where.push("r.reason_id = ?");
    args.push(reasonId);
  }
  if (fromTime) {
    where.push("r.created_at >= ?");
    args.push(fromTime);
  }
  if (toTime) {
    where.push("r.created_at <= ?");
    args.push(toTime);
  }
  if (filterType === "add") where.push("r.delta > 0");
  if (filterType === "subtract") where.push("r.delta < 0");
  const db = getDb();
  const condition = where.join(" AND ");
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM credit_records r JOIN students s ON s.id = r.student_id WHERE ${condition}`,
      )
      .get(...args) as { count: number }
  ).count;
  const records = db
    .prepare(
      `
    SELECT r.id, r.student_id AS studentId, r.reason_id AS reasonId, r.reason_name AS reasonName, r.group_name AS groupName,
      r.delta, r.client_id AS clientId, r.created_at AS createdAt, s.name AS studentName
    FROM credit_records r JOIN students s ON s.id = r.student_id WHERE ${condition} ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `,
    )
    .all(...args, pageSize, (page - 1) * pageSize);
  return NextResponse.json({ records, total, page, pageSize });
});
