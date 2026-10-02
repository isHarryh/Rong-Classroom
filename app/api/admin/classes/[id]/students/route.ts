import { NextResponse } from "next/server";
import { getDb, nextSortId, parseStatus, type Db } from "@/lib/db";
import { jsonError, readJson, requireClassSession, route } from "@/lib/api";

type StudentInput = {
  name?: unknown;
  no?: unknown;
  sex?: unknown;
  groupId?: unknown;
  groupName?: unknown;
  balance?: unknown;
};

const SYSTEM_OPERATION_REASON = "系统操作";

function resolveGroup(db: Db, classId: string, input: StudentInput) {
  if (input.groupId)
    return db
      .prepare("SELECT id, name FROM groups_table WHERE id = ? AND class_id = ? AND status = 1")
      .get(String(input.groupId), classId) as { id: string; name: string } | undefined;
  if (input.groupName)
    return db
      .prepare("SELECT id, name FROM groups_table WHERE class_id = ? AND name = ? AND status = 1")
      .get(classId, String(input.groupName).trim()) as { id: string; name: string } | undefined;
  return undefined;
}

function keepCurrentGroup(db: Db, classId: string, studentId: string) {
  return db
    .prepare(
      "SELECT id FROM groups_table WHERE id = (SELECT group_id FROM students WHERE id = ? AND class_id = ?) AND status != 2",
    )
    .get(studentId, classId) as { id: string } | undefined;
}

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: classId } = await params;
  await requireClassSession(classId);
  const body = await readJson<{
    action?: string;
    student?: StudentInput;
    rows?: StudentInput[];
    onDuplicate?: string;
    studentId?: string;
    status?: number;
  }>(request);
  const db = getDb();
  if (body.action === "status") {
    if (!body.studentId) return jsonError("学生状态无效");
    const status = parseStatus(body.status);
    if (status === undefined) return jsonError("学生状态无效");
    db.prepare("UPDATE students SET status = ? WHERE id = ? AND class_id = ?").run(status, body.studentId, classId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "update") {
    const input = body.student || {};
    const name = String(input.name || "").trim();
    if (!name || !body.studentId) return jsonError("学生信息无效");
    const group = resolveGroup(db, classId, input);
    if (input.groupId && !group) return jsonError("组别不存在", 404);
    const duplicate = db
      .prepare("SELECT id FROM students WHERE class_id = ? AND name = ? AND id != ?")
      .get(classId, name, body.studentId);
    if (duplicate) return jsonError("该班级已存在同名学生", 409);
    const no = String(input.no || "").trim() || null;
    const sex = [0, 1, 2].includes(Number(input.sex)) ? Number(input.sex) : 0;
    const current = keepCurrentGroup(db, classId, String(body.studentId));
    const result = db
      .prepare("UPDATE students SET name = ?, no = ?, sex = ?, group_id = ? WHERE id = ? AND class_id = ?")
      .run(
        name,
        no,
        sex,
        group?.id || (input.groupId === undefined ? current?.id || null : null),
        body.studentId,
        classId,
      );
    if (!result.changes) return jsonError("学生不存在", 404);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "import") {
    const onDuplicate = body.onDuplicate === "overwrite" ? "overwrite" : "skip";
    const rows: { name: string; no: string | null; groupName: string; sex: number; balance: number }[] = [];
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const input of body.rows || []) {
      const name = String(input.name ?? "").trim();
      if (!name) continue;
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
      const sex = Number(input.sex);
      const balance = Number(input.balance);
      rows.push({
        name,
        no: String(input.no ?? "").trim() || null,
        groupName: String(input.groupName ?? "").trim(),
        sex: [0, 1, 2].includes(sex) ? sex : 0,
        balance: Number.isInteger(balance) ? balance : 0,
      });
    }
    if (duplicates.size) return jsonError(`文件内存在重复姓名：${[...duplicates].join("、")}`);
    const resolveOrCreateGroup = (groupName: string) => {
      if (!groupName) return undefined;
      const existing = resolveGroup(db, classId, { groupName });
      if (existing) return existing;
      const group = { id: crypto.randomUUID(), name: groupName };
      db.prepare(
        "INSERT INTO groups_table (id, name, sort_id, class_id, status, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      ).run(group.id, group.name, nextSortId(db, "groups_table", classId), classId, Date.now());
      return group;
    };
    const findExisting = db.prepare("SELECT id FROM students WHERE class_id = ? AND name = ?");
    const insertStudent = db.prepare(
      "INSERT INTO students (id, name, no, sex, class_id, group_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    );
    const updateStudent = db.prepare("UPDATE students SET no = ?, sex = ?, group_id = ?, status = 1 WHERE id = ?");
    const updateStudentKeepingGroup = db.prepare("UPDATE students SET no = ?, sex = ?, status = 1 WHERE id = ?");
    const deleteImportRecords = db.prepare("DELETE FROM credit_records WHERE student_id = ? AND reason_id IS NULL");
    const insertImportRecord = db.prepare(
      "INSERT INTO credit_records (id, student_id, reason_id, reason_name, group_name, delta, client_id, created_at) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?)",
    );
    const findGroupName = db.prepare(
      "SELECT g.name AS name FROM students s LEFT JOIN groups_table g ON g.id = s.group_id WHERE s.id = ?",
    );
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const run = db.transaction(() => {
      for (const row of rows) {
        const existing = findExisting.get(classId, row.name) as { id: string } | undefined;
        let studentId: string;
        if (existing) {
          if (onDuplicate === "skip") {
            skipped++;
            continue;
          }
          const group = resolveOrCreateGroup(row.groupName);
          if (group) updateStudent.run(row.no, row.sex, group.id, existing.id);
          else updateStudentKeepingGroup.run(row.no, row.sex, existing.id);
          studentId = existing.id;
          updated++;
        } else {
          const group = resolveOrCreateGroup(row.groupName);
          studentId = crypto.randomUUID();
          insertStudent.run(studentId, row.name, row.no, row.sex, classId, group?.id || null, Date.now());
          created++;
        }
        deleteImportRecords.run(studentId);
        if (row.balance !== 0) {
          const group = findGroupName.get(studentId) as { name?: string | null } | undefined;
          insertImportRecord.run(
            crypto.randomUUID(),
            studentId,
            SYSTEM_OPERATION_REASON,
            group?.name || "未分组",
            row.balance,
            Date.now(),
          );
        }
      }
    });
    run();
    return NextResponse.json({ created, updated, skipped });
  }
  if (body.action !== undefined) return jsonError("不支持的学生操作");
  const input = body.student || {};
  const name = String(input.name || "").trim();
  if (!name) return jsonError("学生信息无效");
  const group = resolveGroup(db, classId, input);
  if (input.groupId && !group) return jsonError("组别不存在", 404);
  const no = String(input.no || "").trim() || null;
  const sex = [0, 1, 2].includes(Number(input.sex)) ? Number(input.sex) : 0;
  const duplicate = db.prepare("SELECT id FROM students WHERE class_id = ? AND name = ?").get(classId, name);
  if (duplicate) return jsonError("该班级已存在同名学生", 409);
  db.prepare(
    "INSERT INTO students (id, name, no, sex, class_id, group_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
  ).run(crypto.randomUUID(), name, no, sex, classId, group?.id || null, Date.now());
  return NextResponse.json({ created: 1, updated: 0 });
});
