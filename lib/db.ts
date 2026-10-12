import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_PET_STAGE2_AT, DEFAULT_PET_STAGE3_AT, derivePetStage } from "./pets";
import type { GroupItem, PetInfo, PetThresholds, Student } from "./types";

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "rong-classroom.db");
// Next.js dev re-evaluates modules on hot reload; cache the singleton on globalThis
// so the connection and schema survive reloads.
type DbGlobal = typeof globalThis & { __rongDb?: Database.Database };
const globalCache = globalThis as DbGlobal;

export const STATUS = { DISABLED: 0, ENABLED: 1, DELETED: 2 } as const;
const STATUS_VALUES: number[] = [STATUS.DISABLED, STATUS.ENABLED, STATUS.DELETED];

export type Db = Database.Database;

export function parseStatus(input: unknown) {
  return typeof input === "number" && Number.isInteger(input) && STATUS_VALUES.includes(input) ? input : undefined;
}

export function getDb(): Db {
  if (globalCache.__rongDb) return globalCache.__rongDb;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const connection = new Database(databasePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role INTEGER NOT NULL DEFAULT 0 CHECK (role BETWEEN 0 AND 1),
      status INTEGER NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 1),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      term_year INTEGER NOT NULL,
      term_num INTEGER NOT NULL,
      owner_id TEXT,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 2),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS groups_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_id INTEGER NOT NULL DEFAULT 0,
      class_id TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 2),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      no TEXT,
      sex INTEGER NOT NULL DEFAULT 0 CHECK (sex BETWEEN 0 AND 2),
      class_id TEXT NOT NULL,
      group_id TEXT,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 2),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (group_id) REFERENCES groups_table(id)
    );
    CREATE TABLE IF NOT EXISTS credit_reasons (
      id TEXT PRIMARY KEY,
      sort_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      parent_id TEXT,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 2),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES credit_reasons(id)
    );
    CREATE TABLE IF NOT EXISTS credit_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      reason_id TEXT,
      reason_name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      delta INTEGER NOT NULL CHECK (delta != 0 AND (reason_id IS NULL OR delta BETWEEN -10 AND 10)),
      client_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (reason_id) REFERENCES credit_reasons(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      secret TEXT NOT NULL,
      class_id TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 2),
      active_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS pets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL UNIQUE,
      species TEXT NOT NULL,
      stage INTEGER NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 3),
      recruited_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id, status);
    CREATE INDEX IF NOT EXISTS idx_records_student ON credit_records(student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_records_created ON credit_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_groups_class ON groups_table(class_id, sort_id);
    CREATE INDEX IF NOT EXISTS idx_reasons_parent ON credit_reasons(parent_id, sort_id);
    CREATE INDEX IF NOT EXISTS idx_pets_student ON pets(student_id);
  `);
  migrate(connection);
  seed(connection);
  globalCache.__rongDb = connection;
  return connection;
}

function migrate(db: Db) {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(classes)").all() as { name: string }[]).map(column => column.name),
  );
  if (!columns.has("pet_stage2_at"))
    db.exec(`ALTER TABLE classes ADD COLUMN pet_stage2_at INTEGER NOT NULL DEFAULT ${DEFAULT_PET_STAGE2_AT}`);
  if (!columns.has("pet_stage3_at"))
    db.exec(`ALTER TABLE classes ADD COLUMN pet_stage3_at INTEGER NOT NULL DEFAULT ${DEFAULT_PET_STAGE3_AT}`);
}

function seed(db: Db) {
  const now = Date.now();
  if (
    (
      db.prepare("SELECT COUNT(*) AS count FROM credit_reasons").get() as {
        count: number;
      }
    ).count === 0
  ) {
    const insert = db.prepare(
      "INSERT INTO credit_reasons (id, sort_id, name, parent_id, status, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    );
    const add = (name: string, sortId: number, parentId?: string) => {
      const id = crypto.randomUUID();
      insert.run(id, sortId, name, parentId || null, now);
      return id;
    };
    add("课堂表现", 10);
    const homework = add("学科作业", 20);
    ["清单", "语文", "数学", "英语", "物理", "历史", "道法", "地理", "生物", "其他"].forEach((name, i) =>
      add(name, 21 + i, homework),
    );
    const discipline = add("纪律", 40);
    ["班会", "课堂", "课间", "午休", "延时", "其他"].forEach((name, i) => add(name, 41 + i, discipline));
    add("卫生", 60);
    add("文明礼仪", 70);
    add("集体活动", 80);
    add("其他原因", 90);
  }
}

type SortTable = "groups_table" | "credit_reasons";

const SORT_SCOPE: Record<SortTable, string> = {
  groups_table: "class_id = ?",
  credit_reasons: "parent_id IS ?",
};

export function nextSortId(db: Db, table: SortTable, scopeValue: string | null) {
  const row = db
    .prepare(`SELECT COALESCE(MAX(sort_id), -1) AS max FROM ${table} WHERE ${SORT_SCOPE[table]}`)
    .get(scopeValue) as { max: number };
  return row.max + 1;
}

export function moveSortedRow(db: Db, table: SortTable, id: string, direction: -1 | 1) {
  const current = db
    .prepare(
      `SELECT sort_id AS sortId, ${table === "groups_table" ? "class_id" : "parent_id"} AS scope FROM ${table} WHERE id = ?`,
    )
    .get(id) as { sortId: number; scope: string | null } | undefined;
  if (!current) return;
  const other = db
    .prepare(
      `SELECT id, sort_id AS sortId FROM ${table} WHERE ${SORT_SCOPE[table]} AND status != 2 AND sort_id ${
        direction < 0 ? "<" : ">"
      } ? ORDER BY sort_id ${direction < 0 ? "DESC" : "ASC"} LIMIT 1`,
    )
    .get(current.scope, current.sortId) as { id: string; sortId: number } | undefined;
  if (!other) return;
  const swap = db.transaction(() => {
    db.prepare(`UPDATE ${table} SET sort_id = ? WHERE id = ?`).run(other.sortId, id);
    db.prepare(`UPDATE ${table} SET sort_id = ? WHERE id = ?`).run(current.sortId, other.id);
  });
  swap();
}

export function touchClient(db: Db, clientId: string) {
  db.prepare("UPDATE clients SET active_at = ? WHERE id = ?").run(Date.now(), clientId);
}

export function getOrderedReasons(db: Db, onlyEnabled = false) {
  const rows = db
    .prepare(
      `SELECT id, name, parent_id AS parentId, status, sort_id AS sortId, created_at AS createdAt
       FROM credit_reasons ${onlyEnabled ? "WHERE status = 1" : ""}`,
    )
    .all() as {
    id: string;
    name: string;
    parentId: string | null;
    status: number;
    sortId: number;
    createdAt: number;
  }[];
  const bySort = (a: { sortId: number; createdAt: number }, b: { sortId: number; createdAt: number }) =>
    a.sortId - b.sortId || a.createdAt - b.createdAt;
  const tops = rows.filter(row => !row.parentId).sort(bySort);
  return tops
    .flatMap(top => [top, ...rows.filter(row => row.parentId === top.id).sort(bySort)])
    .map(({ id, name, parentId, status }) => ({ id, name, parentId, status }));
}

export function getPetEnabled(db: Db) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'pet_enabled'").get() as
    { value: string } | undefined;
  return row?.value !== "0";
}

export function setPetEnabled(db: Db, enabled: boolean) {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('pet_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(enabled ? "1" : "0");
}

export function getPetThresholds(db: Db, classId: string): PetThresholds {
  const row = db
    .prepare("SELECT pet_stage2_at AS stage2, pet_stage3_at AS stage3 FROM classes WHERE id = ?")
    .get(classId) as PetThresholds | undefined;
  return row ?? { stage2: DEFAULT_PET_STAGE2_AT, stage3: DEFAULT_PET_STAGE3_AT };
}

export function getPet(db: Db, studentId: string): PetInfo | undefined {
  return db
    .prepare("SELECT species, stage, recruited_at AS recruitedAt FROM pets WHERE student_id = ?")
    .get(studentId) as PetInfo | undefined;
}

// Positive credits only; imported balances (reason_id IS NULL) do not count.
export function getStudentGrowth(db: Db, studentId: string) {
  return (
    db
      .prepare(
        "SELECT COALESCE(SUM(delta), 0) AS growth FROM credit_records WHERE student_id = ? AND delta > 0 AND reason_id IS NOT NULL",
      )
      .get(studentId) as { growth: number }
  ).growth;
}

export function savePet(db: Db, classId: string, studentId: string, species: string, now = Date.now()): PetInfo {
  const thresholds = getPetThresholds(db, classId);
  const derived = derivePetStage(getStudentGrowth(db, studentId), thresholds.stage2, thresholds.stage3);
  const existing = db.prepare("SELECT stage FROM pets WHERE student_id = ?").get(studentId) as
    { stage: number } | undefined;
  if (existing) {
    const stage = Math.max(existing.stage, derived);
    db.prepare("UPDATE pets SET species = ?, stage = ?, recruited_at = ? WHERE student_id = ?").run(
      species,
      stage,
      now,
      studentId,
    );
    return { species, stage, recruitedAt: now };
  }
  db.prepare(
    "INSERT INTO pets (id, student_id, species, stage, recruited_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(crypto.randomUUID(), studentId, species, derived, now, now);
  return { species, stage: derived, recruitedAt: now };
}

export type ClassBundle = {
  students: Student[];
  groups: GroupItem[];
  petEnabled: boolean;
  petThresholds: PetThresholds | null;
};

export function getClassBundle(db: Db, classId: string, includeDeleted = false, includePet = true): ClassBundle {
  const studentStatusClause = includeDeleted ? "" : " AND s.status != 2";
  const groupStatusClause = includeDeleted ? "" : " AND g.status != 2";
  const growthSelect = includePet
    ? "COALESCE((SELECT SUM(delta) FROM credit_records r WHERE r.student_id = s.id AND r.delta > 0 AND r.reason_id IS NOT NULL), 0) AS growth,"
    : "";
  const students = db
    .prepare(
      `
    SELECT s.id, s.name, s.no, s.sex, s.class_id AS classId, s.group_id AS groupId, s.status, s.created_at AS createdAt,
      COALESCE((SELECT SUM(delta) FROM credit_records r WHERE r.student_id = s.id), 0) AS balance,
      ${growthSelect}
      g.name AS groupName
    FROM students s LEFT JOIN groups_table g ON g.id = s.group_id AND g.status != 2
    WHERE s.class_id = ?${studentStatusClause} ORDER BY COALESCE(g.sort_id, 999), CASE WHEN s.no IS NULL OR s.no = '' THEN 1 ELSE 0 END, s.no, s.created_at
  `,
    )
    .all(classId) as Student[];
  let petEnabled = false;
  let petThresholds: PetThresholds | null = null;
  if (includePet) {
    petEnabled = getPetEnabled(db);
    petThresholds = getPetThresholds(db, classId);
    const petRows = db
      .prepare(
        `SELECT p.student_id AS studentId, p.species, p.stage, p.recruited_at AS recruitedAt
         FROM pets p JOIN students s ON s.id = p.student_id WHERE s.class_id = ?`,
      )
      .all(classId) as { studentId: string; species: string; stage: number; recruitedAt: number }[];
    const petMap = new Map<string, PetInfo>();
    for (const row of petRows)
      petMap.set(row.studentId, { species: row.species, stage: row.stage, recruitedAt: row.recruitedAt });
    // Growth never drops, so the stored stage is a high-water mark: raise it lazily
    // here instead of tracking upgrades at every credit write.
    const growthMap = new Map(students.map(student => [student.id, student.growth ?? 0]));
    const upgrade = db.prepare("UPDATE pets SET stage = ? WHERE student_id = ? AND stage < ?");
    for (const [studentId, pet] of petMap) {
      const derived = derivePetStage(growthMap.get(studentId) ?? 0, petThresholds.stage2, petThresholds.stage3);
      if (derived > pet.stage) {
        upgrade.run(derived, studentId, derived);
        pet.stage = derived;
      }
    }
    for (const student of students) student.pet = petMap.get(student.id) ?? null;
  }
  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.class_id AS classId, g.status FROM groups_table g WHERE g.class_id = ?${groupStatusClause} ORDER BY g.sort_id, g.created_at`,
    )
    .all(classId) as GroupItem[];
  return { students, groups, petEnabled, petThresholds };
}

const CLIENT_SELECT = `
  SELECT c.id, c.code, c.secret, c.class_id AS classId, c.status, cl.name AS className, cl.status AS classStatus
  FROM clients c JOIN classes cl ON cl.id = c.class_id`;

export type ClientWithClass = {
  id: string;
  code: string;
  secret: string;
  classId: string;
  className: string;
  status: number;
  classStatus: number;
};

export function getClient(db: Db, id: string) {
  return db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id) as ClientWithClass | undefined;
}

export function getClientByCode(db: Db, code: string) {
  return db.prepare(`${CLIENT_SELECT} WHERE c.code = ?`).get(code) as ClientWithClass | undefined;
}

export type AssignGroupResult = "ok" | "student-missing" | "group-missing";

export function assignStudentGroup(
  db: Db,
  classId: string,
  studentId: string,
  groupId: string | null,
): AssignGroupResult {
  if (groupId) {
    const group = db
      .prepare("SELECT id FROM groups_table WHERE id = ? AND class_id = ? AND status = 1")
      .get(groupId, classId);
    if (!group) return "group-missing";
  }
  const result = db
    .prepare("UPDATE students SET group_id = ? WHERE id = ? AND class_id = ? AND status = 1")
    .run(groupId, studentId, classId);
  return result.changes ? "ok" : "student-missing";
}
