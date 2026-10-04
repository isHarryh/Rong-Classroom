"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Tabs } from "antd";
import { ArrowLeft } from "lucide-react";
import { api, formatTerm, reasonLabel, useEditModal, useMessage, useResource } from "@/lib/client";
import type { GroupItem, Reason, Student } from "@/lib/types";
import { GroupingDialog } from "@/components/GroupingDialog";
import { LoadError } from "@/components/LoadError";
import { GroupsTab } from "./_components/GroupsTab";
import { StudentModal } from "./_components/StudentModal";
import { GroupModal } from "./_components/GroupModal";
import { StudentsTab } from "./_components/StudentsTab";
import { RecordsTab } from "./_components/RecordsTab";
import { StudentDetailModal, type StudentDetail } from "./_components/StudentDetailModal";
import { type Bundle, type RecordItem } from "./_components/record-helpers";

export default function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: classId } = use(params);
  const { message, notifyError } = useMessage();
  const [tab, setTab] = useState("students");
  const [showDeleted, setShowDeleted] = useState(false);
  const [groupingOpen, setGroupingOpen] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<{
    source?: Bundle;
    values: Record<string, string | null>;
  }>({ values: {} });
  const studentModal = useEditModal<Student>();
  const groupModal = useEditModal<GroupItem>();
  const [studentDetail, setStudentDetail] = useState<StudentDetail>();
  const [loadedBundle, reload, bundleLoading, bundleError] = useResource(
    () => api<Bundle>(`/api/admin/classes/${classId}?includeDeleted=${showDeleted}`),
    [classId, showDeleted],
  );
  const bundle = useMemo(() => {
    if (!loadedBundle) return undefined;
    const overrides = groupOverrides.source === loadedBundle ? groupOverrides.values : {};
    if (!Object.keys(overrides).length) return loadedBundle;
    return {
      ...loadedBundle,
      students: loadedBundle.students.map(student => {
        if (!(student.id in overrides)) return student;
        const groupId = overrides[student.id];
        const groupName = groupId ? (loadedBundle.groups.find(group => group.id === groupId)?.name ?? null) : null;
        return { ...student, groupId, groupName };
      }),
    };
  }, [loadedBundle, groupOverrides]);
  const [reasons = []] = useResource(async () => (await api<{ reasons: Reason[] }>("/api/admin/reasons")).reasons, []);
  const reasonOptions = useMemo(
    () =>
      reasons
        .filter(reason => reason.status === 1)
        .map(reason => ({
          value: reason.id,
          label: reasonLabel(reason),
        })),
    [reasons],
  );
  const groupOptions = useMemo(() => {
    const active = (bundle?.groups || []).filter(group => group.status === 1);
    const current = studentModal.editing?.groupId
      ? (bundle?.groups || []).filter(group => group.id === studentModal.editing?.groupId)
      : [];
    return [...active, ...current.filter(g => !active.some(a => a.id === g.id))].map(g => ({
      value: g.id,
      label: g.status === 1 ? g.name : `${g.name}（已${g.status === 0 ? "禁用" : "删除"}）`,
    }));
  }, [bundle, studentModal.editing]);
  function refresh() {
    reload();
  }
  async function saveStudent(values: Record<string, unknown>) {
    // Explicit group protocol: keepGroup = true tells the server to keep the
    // current group (this also covers stale selections of disabled groups).
    const activeGroupIds = new Set((bundle?.groups || []).filter(group => group.status === 1).map(group => group.id));
    const { groupId, ...student } = values;
    const staleGroup = typeof groupId === "string" && !activeGroupIds.has(groupId);
    const payload = { ...student, keepGroup: staleGroup, groupId: staleGroup ? undefined : (groupId ?? null) };
    try {
      await api(`/api/admin/classes/${classId}/students`, {
        method: "POST",
        body: JSON.stringify(
          studentModal.editing
            ? { action: "update", studentId: studentModal.editing.id, student: payload }
            : { action: "create", student: payload },
        ),
      });
      message.success(studentModal.editing ? "学生信息已更新" : "学生已添加");
      studentModal.closeModal();
      refresh();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function studentStatus(id: string, status: number) {
    try {
      await api(`/api/admin/classes/${classId}/students`, {
        method: "POST",
        body: JSON.stringify({ action: "status", studentId: id, status }),
      });
      message.success("状态已更新");
      refresh();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  async function saveGroup(values: Record<string, unknown>) {
    try {
      await api(`/api/admin/classes/${classId}/groups`, {
        method: "POST",
        body: JSON.stringify({
          action: groupModal.editing ? "update" : "create",
          groupId: groupModal.editing?.id,
          name: values.name,
        }),
      });
      groupModal.closeModal();
      message.success("组别已保存");
      refresh();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function groupAction(groupId: string, action: string, extra?: Record<string, unknown>) {
    try {
      await api(`/api/admin/classes/${classId}/groups`, {
        method: "POST",
        body: JSON.stringify({ action, groupId, ...extra }),
      });
      if (action === "status") message.success("状态已更新");
      refresh();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  async function moveStudent(studentId: string, groupId: string | null) {
    const student = bundle?.students.find(item => item.id === studentId);
    if (!student) return;
    const previous = student.groupId ?? null;
    if (previous === groupId) return;
    const apply = (value: string | null) =>
      setGroupOverrides(current => ({
        source: loadedBundle,
        values: { ...(current.source === loadedBundle ? current.values : {}), [studentId]: value },
      }));
    apply(groupId);
    try {
      await api(`/api/admin/classes/${classId}/students`, {
        method: "POST",
        body: JSON.stringify({ action: "group", studentId, groupId }),
      });
      // Pull the authoritative bundle so optimistic overrides are replaced by
      // server state instead of lingering as a parallel truth.
      reload();
    } catch (err) {
      apply(previous);
      notifyError(err, "分组调整失败");
    }
  }
  async function openStudentDetail(student: { id: string; name: string }) {
    try {
      const records: RecordItem[] = [];
      const pageSize = 100;
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({ studentId: student.id, page: String(page), pageSize: String(pageSize) });
        const data = await api<{ records: RecordItem[]; total: number }>(
          `/api/admin/classes/${classId}/records?${query}`,
        );
        records.push(...data.records);
        if (data.records.length < pageSize || records.length >= data.total) break;
      }
      setStudentDetail({ student, records });
    } catch (err) {
      notifyError(err, "读取明细失败");
    }
  }
  if (!bundle) {
    if (bundleError) return <LoadError title="班级资料加载失败" onRetry={reload} />;
    if (bundleLoading) return <div className="empty-state">正在加载班级资料...</div>;
    return null;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/admin/classes" className="muted">
            <ArrowLeft size={15} style={{ verticalAlign: "middle" }} /> 返回班级列表
          </Link>
          <h1 style={{ marginTop: 14 }}>{bundle.class.name}</h1>
          <p>{formatTerm(bundle.class.termYear, bundle.class.termNum)}</p>
        </div>
      </div>
      <div className="section-panel">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "students",
              label: `学生（${bundle.students.length}）`,
            },
            {
              key: "groups",
              label: `组别（${bundle.groups.length}）`,
            },
            { key: "records", label: "积分记录" },
          ]}
        />
        {tab === "students" && (
          <StudentsTab
            bundle={bundle}
            studentModal={studentModal}
            showDeleted={showDeleted}
            setShowDeleted={setShowDeleted}
            onRefresh={refresh}
            onStudentStatus={studentStatus}
          />
        )}
        {tab === "groups" && (
          <GroupsTab
            groups={bundle.groups}
            groupModal={groupModal}
            showDeleted={showDeleted}
            setShowDeleted={setShowDeleted}
            onOpenGrouping={() => setGroupingOpen(true)}
            onGroupAction={groupAction}
          />
        )}
        {tab === "records" && (
          <RecordsTab
            classId={classId}
            classLabel={bundle.class.name}
            students={bundle.students}
            reasonOptions={reasonOptions}
            onStudentClick={openStudentDetail}
          />
        )}
      </div>
      <StudentModal
        open={studentModal.open}
        editing={studentModal.editing}
        form={studentModal.form}
        groupOptions={groupOptions}
        onCancel={studentModal.closeModal}
        onOk={() => studentModal.form.submit()}
        onFinish={saveStudent}
      />
      <GroupModal
        open={groupModal.open}
        editing={groupModal.editing}
        form={groupModal.form}
        onCancel={groupModal.closeModal}
        onOk={() => groupModal.form.submit()}
        onFinish={saveGroup}
      />
      <StudentDetailModal detail={studentDetail} onClose={() => setStudentDetail(undefined)} />
      <GroupingDialog
        open={groupingOpen}
        groups={bundle.groups.filter(group => group.status === 1)}
        students={bundle.students
          .filter(student => student.status === 1)
          .map(student => ({ id: student.id, name: student.name, groupId: student.groupId }))}
        onClose={() => setGroupingOpen(false)}
        onMove={moveStudent}
      />
    </>
  );
}
