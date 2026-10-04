import { NextResponse } from "next/server";
import { assignStudentGroup, getDb, nextSortId, parseStatus, type Db } from "@/lib/db";
import { jsonError, readJson, requireClassSession, route } from "@/lib/api";

type StudentInput = {
  name?: unknown;
  no?: unknown;
  sex?: unknown;
  // Explicit group protocol: keepGroup = true keeps the current group; otherwise
  // groupId must be an explicit string (assign) or null/absent (clear).
  keepGroup?: boolean;
  groupId?: unknown;
  groupName?: unknown;
  balance?: unknown;
};

const INSERT_STUDENT_SQL =
  "INSERT INTO students (id, name, no, sex, class_id, group_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)";
const INSERT_GROUP_SQL =
  "INSERT INTO groups_table (id, name, sort_id, class_id, status, created_at) VALUES (?, ?, ?, ?, 1, ?)";

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

function normalizeNo(input: StudentInput) {
  return String(input.no ?? "").trim() || null;
}

function assertSex(input: unknown) {
  return typeof input === "number" && [0, 1, 2].includes(input) ? input : undefined;
}

function requireGroupIfSet(db: Db, classId: string, groupId: string | null) {
  if (!groupId) return true;
  return Boolean(
    db.prepare("SELECT id FROM groups_table WHERE id = ? AND class_id = ? AND status = 1").get(groupId, classId),
  );
}

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: classId } = await params;
  await requireClassSession(classId);
  const body = await readJson<{
    action?: string;
    student?: StudentInput;
    rows?: StudentInput[];
    onDuplicate?: unknown;
    studentId?: unknown;
    groupId?: unknown;
    status?: unknown;
  }>(request);
  const db = getDb();
  if (body.action === "status") {
    if (!body.studentId) return jsonError("学生状态无效");
    const status = parseStatus(body.status);
    if (status === undefined) return jsonError("学生状态无效");
    const result = db
      .prepare("UPDATE students SET status = ? WHERE id = ? AND class_id = ?")
      .run(status, body.studentId, classId);
    if (!result.changes) return jsonError("学生不存在", 404);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "group") {
    if (!body.studentId) return jsonError("学生信息无效");
    let groupId: string | null;
    if (body.groupId === null) groupId = null;
    else if (typeof body.groupId === "string") groupId = body.groupId;
    else return jsonError("组别参数无效");
    const result = assignStudentGroup(db, classId, String(body.studentId), groupId);
    if (result === "group-missing") return jsonError("组别不存在或已停用", 404);
    if (result === "student-missing") return jsonError("学生不存在或已停用", 404);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "update") {
    const input = body.student || {};
    const name = String(input.name || "").trim();
    if (!name || !body.studentId) return jsonError("学生信息无效");
    const sex = assertSex(input.sex);
    if (sex === undefined) return jsonError("性别无效");
    let groupId: string | null;
    if (input.keepGroup === true) {
      groupId = keepCurrentGroup(db, classId, String(body.studentId))?.id ?? null;
    } else {
      groupId = typeof input.groupId === "string" && input.groupId ? input.groupId : null;
      if (!requireGroupIfSet(db, classId, groupId)) return jsonError("组别不存在或已停用", 404);
    }
    const duplicate = db
      .prepare("SELECT id FROM students WHERE class_id = ? AND name = ? AND id != ?")
      .get(classId, name, body.studentId);
    if (duplicate) return jsonError("该班级已存在同名学生", 409);
    const result = db
      .prepare("UPDATE students SET name = ?, no = ?, sex = ?, group_id = ? WHERE id = ? AND class_id = ?")
      .run(name, normalizeNo(input), sex, groupId, body.studentId, classId);
    if (!result.changes) return jsonError("学生不存在", 404);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "import") {
    if (body.onDuplicate !== undefined && body.onDuplicate !== "skip" && body.onDuplicate !== "overwrite")
      return jsonError("重复学生处理方式无效");
    const onDuplicate = body.onDuplicate === "overwrite" ? "overwrite" : "skip";
    if (!Array.isArray(body.rows)) return jsonError("导入数据必须为数组");
    const rows: { name: string; no: string | null; groupName: string; sex: number; balance: number }[] = [];
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const [index, input] of (body.rows as StudentInput[]).entries()) {
      const name = String(input.name ?? "").trim();
      if (!name) continue;
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
      const sex = input.sex === null || input.sex === undefined || input.sex === "" ? 0 : Number(input.sex);
      const balance =
        input.balance === null || input.balance === undefined || input.balance === "" ? 0 : Number(input.balance);
      if (![0, 1, 2].includes(sex) || !Number.isInteger(sex)) return jsonError(`第 ${index + 1} 条数据的性别无效`);
      if (!Number.isInteger(balance)) return jsonError(`第 ${index + 1} 条数据的余额无效，需要整数`);
      rows.push({
        name,
        no: normalizeNo(input),
        groupName: String(input.groupName ?? "").trim(),
        sex,
        balance,
      });
    }
    if (!rows.length) return jsonError("没有可导入的学生数据");
    if (duplicates.size) return jsonError(`文件内存在重复姓名：${[...duplicates].join("、")}`);
    const insertGroup = db.prepare(INSERT_GROUP_SQL);
    const resolveOrCreateGroup = (groupName: string) => {
      if (!groupName) return undefined;
      const existing = resolveGroup(db, classId, { groupName });
      if (existing) return existing;
      const group = { id: crypto.randomUUID(), name: groupName };
      insertGroup.run(group.id, group.name, nextSortId(db, "groups_table", classId), classId, Date.now());
      return group;
    };
    const findExisting = db.prepare("SELECT id FROM students WHERE class_id = ? AND name = ?");
    const insertStudent = db.prepare(INSERT_STUDENT_SQL);
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
  if (body.action === "create") {
    const input = body.student || {};
    const name = String(input.name || "").trim();
    if (!name) return jsonError("学生信息无效");
    const sex = assertSex(input.sex);
    if (sex === undefined) return jsonError("性别无效");
    let groupId: string | null = null;
    const group = resolveGroup(db, classId, input);
    if (typeof input.groupId === "string" && input.groupId && !group) return jsonError("组别不存在或已停用", 404);
    groupId = group?.id ?? null;
    const duplicate = db.prepare("SELECT id FROM students WHERE class_id = ? AND name = ?").get(classId, name);
    if (duplicate) return jsonError("该班级已存在同名学生", 409);
    db.prepare(INSERT_STUDENT_SQL).run(
      crypto.randomUUID(),
      name,
      normalizeNo(input),
      sex,
      classId,
      groupId,
      Date.now(),
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return jsonError("不支持的学生操作");
});
