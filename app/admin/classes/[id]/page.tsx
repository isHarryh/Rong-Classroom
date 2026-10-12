"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Button, InputNumber, Tabs, Tag } from "antd";
import { ArrowLeft } from "lucide-react";
import { api, formatTerm, reasonLabel, useEditModal, useMessage, useResource } from "@/lib/client";
import { DEFAULT_PET_STAGE2_AT, DEFAULT_PET_STAGE3_AT } from "@/lib/pets";
import type { GroupItem, Reason, Student } from "@/lib/types";
import { GroupingDialog } from "@/components/GroupingDialog";
import { LoadError } from "@/components/LoadError";
import { PetPickerDialog } from "@/components/PetPickerDialog";
import { StatusTag } from "@/components/StatusTag";
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
  const [petDraft, setPetDraft] = useState<{ source?: Bundle; stage2: number; stage3: number }>({
    stage2: DEFAULT_PET_STAGE2_AT,
    stage3: DEFAULT_PET_STAGE3_AT,
  });
  const [petSaving, setPetSaving] = useState(false);
  const [petPicker, setPetPicker] = useState<Student>();
  const [petPickerSaving, setPetPickerSaving] = useState(false);
  const [loadedBundle, reload, bundleLoading, bundleError] = useResource(
    () => api<Bundle>(`/api/admin/classes/${classId}?includeDeleted=${showDeleted}`),
    [classId, showDeleted],
  );
  // Adjusting state during render is the sanctioned way to resync the threshold
  // inputs with fresh server data after saves and reloads.
  if (loadedBundle?.petThresholds && petDraft.source !== loadedBundle) {
    setPetDraft({
      source: loadedBundle,
      stage2: loadedBundle.petThresholds.stage2,
      stage3: loadedBundle.petThresholds.stage3,
    });
  }
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
  async function savePetThresholds() {
    const stage2 = Number(petDraft.stage2);
    const stage3 = Number(petDraft.stage3);
    if (!Number.isInteger(stage2) || !Number.isInteger(stage3) || stage2 < 1 || stage3 <= stage2) {
      message.warning("门槛需为正整数，且阶段 3 大于阶段 2");
      return;
    }
    setPetSaving(true);
    try {
      await api(`/api/admin/classes/${classId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "petConfig", petStage2At: stage2, petStage3At: stage3 }),
      });
      message.success("宠物门槛已保存");
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    } finally {
      setPetSaving(false);
    }
  }
  async function randomPets() {
    try {
      const result = await api<{ count: number }>(`/api/admin/classes/${classId}/pets`, {
        method: "POST",
        body: JSON.stringify({ action: "random" }),
      });
      message.success(result.count ? `已为 ${result.count} 名学生分配宠物` : "没有需要分配的学生");
      reload();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  async function changePet(species: string) {
    if (!petPicker) return;
    setPetPickerSaving(true);
    try {
      await api(`/api/admin/classes/${classId}/pets`, {
        method: "POST",
        body: JSON.stringify({ action: "change", studentId: petPicker.id, species }),
      });
      message.success(petPicker.pet ? "宠物已更换" : "宠物已选择");
      setPetPicker(undefined);
      reload();
    } catch (err) {
      notifyError(err, "操作失败");
    } finally {
      setPetPickerSaving(false);
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
      const full = bundle?.students.find(item => item.id === student.id);
      setStudentDetail({ student: full ?? student, records });
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
        <div className="page-heading-main">
          <Link href="/admin/classes" className="muted">
            <ArrowLeft size={15} style={{ verticalAlign: "middle" }} /> 返回班级列表
          </Link>
          <div className="page-heading-title-row">
            <h1>{bundle.class.name}</h1>
            <dl className="page-heading-fields">
              <div>
                <dt>学期</dt>
                <dd>{formatTerm(bundle.class.termYear, bundle.class.termNum)}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  <StatusTag value={bundle.class.status} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <div className="section-panel pet-settings-panel">
        <h3>宠物设置</h3>
        <div className="pet-settings-row">
          <span>当学生正向加分达到</span>
          <InputNumber
            min={1}
            max={10000}
            value={petDraft.stage2}
            onChange={value => setPetDraft(current => ({ ...current, stage2: Number(value ?? 0) }))}
          />
          <span>后宠物晋升阶段 2，达到</span>
          <InputNumber
            min={2}
            max={10000}
            value={petDraft.stage3}
            onChange={value => setPetDraft(current => ({ ...current, stage3: Number(value ?? 0) }))}
          />
          <span>后宠物晋升阶段 3。</span>
          <Button type="primary" loading={petSaving} onClick={savePetThresholds}>
            保存
          </Button>
          {!bundle.petEnabled && <Tag>已全局关闭</Tag>}
        </div>
      </div>
      <div className="section-panel">
        <h3 style={{ margin: "0 0 6px" }}>班级管理</h3>
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
            petEnabled={bundle.petEnabled}
            onChangePet={setPetPicker}
            onRandomPets={randomPets}
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
      <StudentDetailModal
        detail={studentDetail}
        petEnabled={bundle.petEnabled}
        onPetChange={() => {
          const full = studentDetail && bundle.students.find(item => item.id === studentDetail.student.id);
          if (!full) return;
          if (full.status !== 1) {
            message.warning("该学生已停用或已删除，无法更换宠物");
            return;
          }
          setStudentDetail(undefined);
          setPetPicker(full);
        }}
        onClose={() => setStudentDetail(undefined)}
      />
      <GroupingDialog
        open={groupingOpen}
        groups={bundle.groups.filter(group => group.status === 1)}
        students={bundle.students
          .filter(student => student.status === 1)
          .map(student => ({ id: student.id, name: student.name, groupId: student.groupId }))}
        onClose={() => setGroupingOpen(false)}
        onMove={moveStudent}
      />
      <PetPickerDialog
        open={Boolean(petPicker)}
        title={petPicker?.pet ? "更换宠物" : "选择宠物"}
        currentSpecies={petPicker?.pet?.species}
        confirmLoading={petPickerSaving}
        onConfirm={changePet}
        onCancel={() => setPetPicker(undefined)}
      />
    </>
  );
}
