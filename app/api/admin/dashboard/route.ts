import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireClassSession, route } from "@/lib/api";

export const GET = route(async (request: Request) => {
  const classId = new URL(request.url).searchParams.get("classId") || "";
  await requireClassSession(classId);
  const rows = getDb()
    .prepare(
      `
    SELECT r.delta FROM credit_records r JOIN students s ON s.id = r.student_id
    WHERE s.class_id = ? AND s.status = 1
  `,
    )
    .all(classId) as { delta: number }[];
  const positive = rows.filter(row => row.delta > 0).reduce((sum, row) => sum + row.delta, 0);
  const negative = rows.filter(row => row.delta < 0).reduce((sum, row) => sum + Math.abs(row.delta), 0);
  return NextResponse.json({
    metrics: {
      positive,
      negative,
    },
  });
});
