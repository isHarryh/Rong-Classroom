import { NextResponse } from "next/server";
import { requireSession, route } from "@/lib/api";
import { getDb } from "@/lib/db";

type Period = "all" | "month" | "week";

const pad = (value: number) => String(value).padStart(2, "0");
const formatMonth = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const formatDate = (date: Date) => `${formatMonth(date)}-${pad(date.getDate())}`;
const formatMonthDay = (date: Date) => `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfWeek = (date: Date) => {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
};
const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

function parseMonthAnchor(anchor: string | null) {
  const match = anchor?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return undefined;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return new Date(Number(match[1]), month - 1, 1);
}

function parseWeekAnchor(anchor: string | null) {
  const match = anchor?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return undefined;
  return startOfWeek(date);
}

function resolveRange(period: "month" | "week", anchor: string | null) {
  const now = new Date();
  if (period === "month") {
    const current = startOfMonth(now);
    const parsed = parseMonthAnchor(anchor);
    const target = parsed && parsed.getTime() <= current.getTime() ? parsed : current;
    const next = addMonths(target, 1);
    return {
      label: `${target.getFullYear()} 年 ${target.getMonth() + 1} 月`,
      prevAnchor: formatMonth(addMonths(target, -1)),
      nextAnchor: next.getTime() > current.getTime() ? null : formatMonth(next),
      range: { start: target.getTime(), end: next.getTime() },
      previous: { start: addMonths(target, -1).getTime(), end: target.getTime() },
    };
  }
  const current = startOfWeek(now);
  const parsed = parseWeekAnchor(anchor);
  const target = parsed && parsed.getTime() <= current.getTime() ? parsed : current;
  const next = addDays(target, 7);
  const weeksAgo = Math.round((current.getTime() - target.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const rangeText = `${formatMonthDay(target)} 至 ${formatMonthDay(addDays(target, 6))}`;
  return {
    label: weeksAgo === 0 ? `本周内（${rangeText}）` : `之前 ${weeksAgo} 周（${rangeText}）`,
    prevAnchor: formatDate(addDays(target, -7)),
    nextAnchor: next.getTime() > current.getTime() ? null : formatDate(next),
    range: { start: target.getTime(), end: next.getTime() },
    previous: { start: addDays(target, -7).getTime(), end: target.getTime() },
  };
}

function topWithTies<T>(sorted: T[], key: (item: T) => number) {
  const result: T[] = [];
  for (let index = 0; index < sorted.length && index < 3;) {
    const value = key(sorted[index]);
    let end = index;
    while (end < sorted.length && key(sorted[end]) === value) end++;
    result.push(...sorted.slice(index, end));
    index = end;
  }
  return result;
}

export const GET = route(async (request: Request) => {
  const session = await requireSession("client");
  const classId = session.classId || "";
  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period");
  const period: Period = periodParam === "month" || periodParam === "week" ? periodParam : "all";
  const anchor = url.searchParams.get("anchor");
  const db = getDb();

  const students = db
    .prepare("SELECT id, name, group_id AS groupId FROM students WHERE class_id = ? AND status = 1")
    .all(classId) as { id: string; name: string; groupId: string | null }[];
  const groups = db
    .prepare("SELECT id, name FROM groups_table WHERE class_id = ? AND status = 1 ORDER BY sort_id, created_at")
    .all(classId) as { id: string; name: string }[];

  const resolved = period === "all" ? undefined : resolveRange(period, anchor);
  const records = db
    .prepare(
      `SELECT r.student_id AS studentId, r.reason_id AS reasonId, r.reason_name AS reasonName, r.delta AS delta, r.created_at AS createdAt
       FROM credit_records r JOIN students s ON s.id = r.student_id
       WHERE s.class_id = ? AND s.status = 1
       ${resolved ? "AND r.created_at >= ? AND r.created_at < ?" : ""}`,
    )
    .all(...(resolved ? [classId, resolved.previous.start, resolved.range.end] : [classId])) as {
    studentId: string;
    reasonId: string | null;
    reasonName: string;
    delta: number;
    createdAt: number;
  }[];
  const current = resolved ? records.filter(record => record.createdAt >= resolved.range.start) : records;
  const previous = resolved ? records.filter(record => record.createdAt < resolved.range.start) : [];

  const activeGroupIds = new Set(groups.map(group => group.id));
  const studentGroup = new Map(
    students.map(student => [
      student.id,
      student.groupId && activeGroupIds.has(student.groupId) ? student.groupId : null,
    ]),
  );
  const buckets = [
    ...groups.map(group => ({ id: group.id as string | null, name: group.name, total: 0, students: 0 })),
    { id: null as string | null, name: "未分组", total: 0, students: 0 },
  ];
  const bucketById = new Map(buckets.map(bucket => [bucket.id, bucket]));
  for (const student of students) {
    const bucket = bucketById.get(studentGroup.get(student.id) ?? null);
    if (bucket) bucket.students++;
  }
  for (const record of current) {
    const bucket = bucketById.get(studentGroup.get(record.studentId) ?? null);
    if (bucket) bucket.total += record.delta;
  }
  const groupStats = buckets
    .filter(bucket => bucket.id !== null || bucket.students > 0)
    .map(bucket => ({
      id: bucket.id,
      name: bucket.name,
      total: bucket.total,
      average: bucket.students ? bucket.total / bucket.students : 0,
      students: bucket.students,
    }));

  const netByStudent = new Map<string, number>();
  for (const record of current)
    netByStudent.set(record.studentId, (netByStudent.get(record.studentId) ?? 0) + record.delta);
  const nameById = new Map(students.map(student => [student.id, student.name]));
  const stars = topWithTies(
    [...netByStudent.entries()]
      .filter(([, value]) => value > 0)
      .map(([id, value]) => ({ id, name: nameById.get(id) || "", value }))
      .sort((a, b) => b.value - a.value),
    item => item.value,
  );

  let progress: { id: string; name: string; value: number; rate: number | null }[] | null = null;
  if (resolved) {
    const previousNet = new Map<string, number>();
    for (const record of previous)
      previousNet.set(record.studentId, (previousNet.get(record.studentId) ?? 0) + record.delta);
    const entries = [...netByStudent.entries()].flatMap(([id, value]) => {
      if (value <= 0) return [];
      const base = previousNet.get(id) ?? 0;
      const rate = base === 0 ? null : base > 0 ? (value - base) / base : (value - base) / -base;
      return [{ id, name: nameById.get(id) || "", value, rate }];
    });
    entries.sort((a, b) => {
      const rateA = a.rate === null ? Infinity : a.rate;
      const rateB = b.rate === null ? Infinity : b.rate;
      if (rateA !== rateB) return rateB - rateA;
      return b.value - a.value;
    });
    progress = topWithTies(entries, item => (item.rate === null ? Infinity : item.rate));
  }

  const positiveReasons = new Map<string, number>();
  const negativeReasons = new Map<string, number>();
  for (const record of current) {
    if (!record.reasonId) continue;
    const target = record.delta > 0 ? positiveReasons : negativeReasons;
    target.set(record.reasonName, (target.get(record.reasonName) ?? 0) + Math.abs(record.delta));
  }
  const topReasons = (source: Map<string, number>) =>
    [...source.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

  return NextResponse.json({
    period,
    label: resolved?.label ?? "累计",
    prevAnchor: resolved?.prevAnchor ?? null,
    nextAnchor: resolved?.nextAnchor ?? null,
    groups: groupStats,
    stars,
    progress,
    reasons: { positive: topReasons(positiveReasons), negative: topReasons(negativeReasons) },
  });
});
