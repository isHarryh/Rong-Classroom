import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HttpError, requireClassSession, route } from "@/lib/api";

function parseDate(value: string | undefined, time: string) {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T${time}`).getTime();
  if (!Number.isFinite(timestamp)) throw new HttpError(400, "日期格式无效");
  return timestamp;
}

function cleanRecordFilters(input: Record<string, string | undefined>) {
  return {
    studentId: input.studentId || undefined,
    reasonId: input.reasonId || undefined,
    from: parseDate(input.from, "00:00:00"),
    to: parseDate(input.to, "23:59:59.999"),
    type: input.type === "add" || input.type === "subtract" ? input.type : undefined,
  };
}

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: classId } = await params;
  await requireClassSession(classId);
  const search = new URL(request.url).searchParams;
  const page = Math.max(1, Math.floor(Number(search.get("page")) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(search.get("pageSize")) || 20)));
  const filters = cleanRecordFilters({
    studentId: search.get("studentId") || undefined,
    reasonId: search.get("reasonId") || undefined,
    from: search.get("from") || undefined,
    to: search.get("to") || undefined,
    type: search.get("type") || undefined,
  });
  const where = ["s.class_id = ?"];
  const args: (string | number)[] = [classId];
  if (filters.studentId) {
    where.push("r.student_id = ?");
    args.push(filters.studentId);
  }
  if (filters.reasonId) {
    where.push("r.reason_id = ?");
    args.push(filters.reasonId);
  }
  if (filters.from) {
    where.push("r.created_at >= ?");
    args.push(filters.from);
  }
  if (filters.to) {
    where.push("r.created_at <= ?");
    args.push(filters.to);
  }
  if (filters.type === "add") where.push("r.delta > 0");
  if (filters.type === "subtract") where.push("r.delta < 0");
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
