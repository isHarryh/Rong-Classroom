"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tabs, Upload } from "antd";
import type { TableColumnsType, UploadFile } from "antd";
import { ManOutlined, WomanOutlined } from "@ant-design/icons";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  Edit3,
  FileUp,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import * as XLSX from "xlsx";
import { StatusTag } from "@/components/StatusTag";
import { api, formatTime, useMessage, useResource } from "@/lib/client";

type Group = { id: string; name: string; status: number };
type Student = {
  id: string;
  name: string;
  no?: string | null;
  sex: number;
  groupId?: string | null;
  groupName?: string | null;
  status: number;
  balance: number;
  createdAt: number;
};
type RecordItem = {
  id: string;
  studentId: string;
  studentName: string;
  reasonName: string;
  groupName: string;
  delta: number;
  createdAt: number;
};
type Reason = { id: string; name: string; parentId?: string | null; status: number };
type ImportRow = { name: string; no: string; groupName: string; sex: number; balance: number };
type Bundle = {
  class: {
    id: string;
    name: string;
    termYear: number;
    termNum: number;
  };
  groups: Group[];
  students: Student[];
};

export default function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: classId } = use(params);
  const { message, notifyError } = useMessage();
  const [tab, setTab] = useState("students");
  const [showDeleted, setShowDeleted] = useState(false);
  const [studentModal, setStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student>();
  const [groupModal, setGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group>();
  const [studentForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importRawRows, setImportRawRows] = useState<unknown[][]>([]);
  const [importHeader, setImportHeader] = useState(true);
  const [importOnDuplicate, setImportOnDuplicate] = useState<"skip" | "overwrite">("skip");
  const [importFiles, setImportFiles] = useState<UploadFile[]>([]);
  const [recordFilters, setRecordFilters] = useState({
    studentId: "",
    reasonId: "",
    type: "",
    from: "",
    to: "",
  });
  const [recordPage, setRecordPage] = useState(1);
  const [studentDetail, setStudentDetail] = useState<{
    student: { id: string; name: string };
    records: RecordItem[];
  }>();
  const importRows = useMemo<ImportRow[]>(() => {
    const dataRows = importHeader ? importRawRows.slice(1) : importRawRows;
    return dataRows.flatMap(row => {
      const name = String(row[0] ?? "").trim();
      if (!name) return [];
      const sexText = String(row[3] ?? "").trim();
      const balanceText = String(row[4] ?? "").trim();
      return [
        {
          name,
          no: String(row[1] ?? "").trim(),
          groupName: String(row[2] ?? "").trim(),
          sex: sexText === "男" ? 1 : sexText === "女" ? 2 : 0,
          balance: /^-?\d+$/.test(balanceText) ? Number(balanceText) : 0,
        },
      ];
    });
  }, [importRawRows, importHeader]);
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const row of importRows) {
      if (seen.has(row.name)) duplicates.add(row.name);
      seen.add(row.name);
    }
    return [...duplicates];
  }, [importRows]);
  const [bundle, reload] = useResource(
    () => api<Bundle>(`/api/admin/classes/${classId}?includeDeleted=${showDeleted}`),
    [classId, showDeleted],
  );
  const [reasons = []] = useResource(async () => (await api<{ reasons: Reason[] }>("/api/admin/reasons")).reasons, []);
  const recordQuery = useMemo(
    () =>
      new URLSearchParams({
        ...recordFilters,
        ...(tab === "records" ? { page: String(recordPage), pageSize: "20" } : { pageSize: "100" }),
      }),
    [recordFilters, recordPage, tab],
  );
  const [recordsData = { records: [] as RecordItem[], total: 0 }, reloadRecords, recordsLoading] = useResource(
    () => api<{ records: RecordItem[]; total: number }>(`/api/admin/classes/${classId}/records?${recordQuery}`),
    [classId, recordQuery],
  );
  const records = recordsData.records;
  const recordTotal = recordsData.total;
  function setRecordFilter(key: keyof typeof recordFilters, value?: string) {
    setRecordPage(1);
    setRecordFilters(current => ({ ...current, [key]: value || "" }));
  }
  const reasonOptions = useMemo(
    () =>
      reasons
        .filter(reason => reason.status === 1)
        .map(reason => ({
          value: reason.id,
          label: reason.parentId ? `　${reason.name}` : reason.name,
        })),
    [reasons],
  );
  const groupOptions = useMemo(() => {
    const active = (bundle?.groups || []).filter(group => group.status === 1);
    const current = editingStudent?.groupId
      ? (bundle?.groups || []).filter(group => group.id === editingStudent.groupId)
      : [];
    return [...active, ...current.filter(g => !active.some(a => a.id === g.id))].map(g => ({
      value: g.id,
      label: g.status === 1 ? g.name : `${g.name}（已${g.status === 0 ? "禁用" : "删除"}）`,
    }));
  }, [bundle, editingStudent]);
  function refresh() {
    reload();
    reloadRecords();
  }
  async function saveStudent(values: Record<string, unknown>) {
    const activeGroupIds = new Set((bundle?.groups || []).filter(group => group.status === 1).map(group => group.id));
    const { groupId, ...rest } = values;
    const staleGroup = typeof groupId === "string" && !activeGroupIds.has(groupId);
    const student = staleGroup ? rest : { ...rest, groupId: groupId ?? null };
    try {
      await api(`/api/admin/classes/${classId}/students`, {
        method: "POST",
        body: JSON.stringify(
          editingStudent ? { action: "update", studentId: editingStudent.id, student } : { student },
        ),
      });
      message.success(editingStudent ? "学生信息已更新" : "学生已添加");
      setStudentModal(false);
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
          action: editingGroup ? "update" : "create",
          groupId: editingGroup?.id,
          name: values.name,
        }),
      });
      setGroupModal(false);
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
      refresh();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  async function openStudentDetail(student: { id: string; name: string }) {
    try {
      const records = await fetchAllRecords({ studentId: student.id });
      setStudentDetail({ student, records });
    } catch (err) {
      notifyError(err, "读取明细失败");
    }
  }
  async function readImportFile(file: File) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      setImportRawRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false }));
    } catch {
      setImportRawRows([]);
      message.error("文件解析失败，请确认是有效的 Excel 文件");
      return Upload.LIST_IGNORE;
    }
    return false;
  }
  function closeImport() {
    setImportOpen(false);
    setImportRawRows([]);
    setImportFiles([]);
    setImportHeader(true);
    setImportOnDuplicate("skip");
  }
  async function submitImport() {
    if (!importRows.length) {
      message.warning("请先上传包含学生数据的文件");
      return;
    }
    if (duplicateNames.length) {
      message.error(`文件内存在重复姓名：${duplicateNames.join("、")}`);
      return;
    }
    setImporting(true);
    try {
      const result = await api<{ created: number; updated: number; skipped: number }>(
        `/api/admin/classes/${classId}/students`,
        {
          method: "POST",
          body: JSON.stringify({ action: "import", rows: importRows, onDuplicate: importOnDuplicate }),
        },
      );
      message.success(`导入完成：新增 ${result.created} 人，更新 ${result.updated} 人，跳过 ${result.skipped} 人`);
      closeImport();
      refresh();
    } catch (err) {
      notifyError(err, "导入失败");
    } finally {
      setImporting(false);
    }
  }
  function exportExcel(rows: object[], filename: string, sheetName: string) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheetName);
    XLSX.writeFile(book, filename);
  }
  function toSheetRows(items: RecordItem[]) {
    return items.map(item => ({
      学生: item.studentName,
      组别: item.groupName,
      原因: item.reasonName,
      变化: item.delta,
      时间: formatTime(item.createdAt),
    }));
  }
  function toDetailRows(items: RecordItem[]) {
    return items.map(item => ({
      时间: formatTime(item.createdAt),
      组别: item.groupName,
      原因: item.reasonName,
      变化: item.delta,
    }));
  }
  async function fetchAllRecords(extra?: Record<string, string>) {
    const collected: RecordItem[] = [];
    const pageSize = 100;
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({
        ...recordFilters,
        ...extra,
        page: String(page),
        pageSize: String(pageSize),
      });
      const data = await api<{ records: RecordItem[]; total: number }>(
        `/api/admin/classes/${classId}/records?${query}`,
      );
      collected.push(...data.records);
      if (data.records.length < pageSize || collected.length >= data.total) return collected;
    }
  }
  async function exportRecords() {
    if (!bundle || exporting) return;
    setExporting(true);
    try {
      const all = await fetchAllRecords();
      exportExcel(toSheetRows(all), `${bundle.class.name}-积分记录.xlsx`, "积分记录");
      message.success(`已导出 ${all.length} 条记录`);
    } catch (err) {
      notifyError(err, "导出失败");
    } finally {
      setExporting(false);
    }
  }
  if (!bundle) return <div className="empty-state">正在加载班级资料...</div>;
  function recordColumns(withStudent: boolean): TableColumnsType<RecordItem> {
    const columns: TableColumnsType<RecordItem> = [
      {
        title: "时间",
        dataIndex: "createdAt",
        render: value => formatTime(value),
      },
    ];
    if (withStudent)
      columns.push({
        title: "学生",
        dataIndex: "studentName",
        render: (value, item) => (
          <Button
            type="link"
            onClick={() =>
              openStudentDetail({
                id: item.studentId,
                name: item.studentName,
              })
            }
          >
            {value}
          </Button>
        ),
      });
    columns.push(
      { title: "组别快照", dataIndex: "groupName" },
      { title: "原因", dataIndex: "reasonName" },
      {
        title: "变化",
        dataIndex: "delta",
        render: value => (
          <b className={value > 0 ? "balance-positive" : "balance-negative"}>
            {value > 0 ? "+" : ""}
            {value}
          </b>
        ),
      },
    );
    return columns;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/admin/classes" className="muted">
            <ArrowLeft size={15} style={{ verticalAlign: "middle" }} /> 返回班级列表
          </Link>
          <h1 style={{ marginTop: 14 }}>{bundle.class.name}</h1>
          <p>
            {bundle.class.termYear}-{bundle.class.termYear + 1} 学年第 {bundle.class.termNum} 学期
          </p>
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
            { key: "records", label: `积分记录（${recordTotal}）` },
          ]}
        />
        {tab === "students" && (
          <>
            <div className="data-toolbar">
              <Button type="primary" icon={<FileUp size={16} />} onClick={() => setImportOpen(true)}>
                Excel 导入
              </Button>
              <Button
                icon={<UserRound size={16} />}
                onClick={() => {
                  setEditingStudent(undefined);
                  studentForm.resetFields();
                  setStudentModal(true);
                }}
              >
                手动添加学生
              </Button>
            </div>
            <Table
              rowKey="id"
              dataSource={bundle.students}
              pagination={{ pageSize: 12 }}
              columns={[
                {
                  title: "姓名",
                  dataIndex: "name",
                  render: (value, item) => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <b>{value}</b>
                      {item.sex === 1 && <ManOutlined title="男" aria-label="男" style={{ color: "#1677ff" }} />}
                      {item.sex === 2 && <WomanOutlined title="女" aria-label="女" style={{ color: "#eb2f96" }} />}
                    </span>
                  ),
                },
                {
                  title: "学号",
                  dataIndex: "no",
                  render: value => value || <span className="muted">未填写</span>,
                },
                {
                  title: "组别",
                  dataIndex: "groupName",
                  render: value => value || <span className="muted">未分组</span>,
                },
                {
                  title: "余额",
                  dataIndex: "balance",
                  render: value => <b className={value >= 0 ? "balance-positive" : "balance-negative"}>{value} 榕币</b>,
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: value => <StatusTag value={value} />,
                },
                {
                  title: "操作",
                  render: (_, item) => (
                    <div className="inline-actions">
                      <Button
                        type="text"
                        icon={<Edit3 size={15} />}
                        onClick={() => {
                          setEditingStudent(item);
                          studentForm.setFieldsValue(item);
                          setStudentModal(true);
                        }}
                      />
                      {item.status === 2 ? (
                        <Popconfirm title="恢复这个学生？" onConfirm={() => studentStatus(item.id, 1)}>
                          <Button type="text" icon={<RotateCcw size={15} />} />
                        </Popconfirm>
                      ) : (
                        <>
                          <Button type="text" onClick={() => studentStatus(item.id, item.status === 1 ? 0 : 1)}>
                            {item.status === 1 ? "禁用" : "启用"}
                          </Button>
                          <Popconfirm
                            title="学生将进入回收站，历史记录仍会保留。"
                            onConfirm={() => studentStatus(item.id, 2)}
                          >
                            <Button danger type="text" icon={<Trash2 size={15} />} />
                          </Popconfirm>
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <div className="data-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
              <Switch checked={showDeleted} onChange={setShowDeleted} />
              <span className="muted">显示已删除学生</span>
            </div>
          </>
        )}
        {tab === "groups" && (
          <>
            <div className="data-toolbar">
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => {
                  setEditingGroup(undefined);
                  groupForm.resetFields();
                  setGroupModal(true);
                }}
              >
                新增组别
              </Button>
            </div>
            <Table
              rowKey="id"
              dataSource={bundle.groups}
              pagination={false}
              columns={[
                {
                  title: "组名",
                  dataIndex: "name",
                  render: value => <b>{value}</b>,
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: value => <StatusTag value={value} />,
                },
                {
                  title: "操作",
                  render: (_, item) => (
                    <div className="inline-actions">
                      <Button
                        type="text"
                        icon={<ArrowUp size={15} />}
                        onClick={() => groupAction(item.id, "move", { direction: "up" })}
                      />
                      <Button
                        type="text"
                        icon={<ArrowDown size={15} />}
                        onClick={() => groupAction(item.id, "move", { direction: "down" })}
                      />
                      <Button
                        type="text"
                        icon={<Edit3 size={15} />}
                        onClick={() => {
                          setEditingGroup(item);
                          groupForm.setFieldsValue({ name: item.name });
                          setGroupModal(true);
                        }}
                      />
                      {item.status === 2 ? (
                        <Button
                          type="text"
                          icon={<RotateCcw size={15} />}
                          onClick={() => groupAction(item.id, "status", { status: 1 })}
                        />
                      ) : (
                        <>
                          <Button
                            type="text"
                            onClick={() =>
                              groupAction(item.id, "status", {
                                status: item.status === 1 ? 0 : 1,
                              })
                            }
                          >
                            {item.status === 1 ? "禁用" : "启用"}
                          </Button>
                          <Popconfirm
                            title="组别将进入回收站，组内学生会保留。"
                            onConfirm={() => groupAction(item.id, "status", { status: 2 })}
                          >
                            <Button danger type="text" icon={<Trash2 size={15} />} />
                          </Popconfirm>
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <div className="data-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
              <Switch checked={showDeleted} onChange={setShowDeleted} />
              <span className="muted">显示已删除组别</span>
            </div>
          </>
        )}
        {tab === "records" && (
          <>
            <div className="data-toolbar">
              <Select
                allowClear
                placeholder="学生"
                style={{ width: 150 }}
                value={recordFilters.studentId || undefined}
                onChange={value => setRecordFilter("studentId", value)}
                options={bundle.students.map(s => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
              <Select
                allowClear
                placeholder="原因"
                style={{ width: 170 }}
                value={recordFilters.reasonId || undefined}
                onChange={value => setRecordFilter("reasonId", value)}
                options={reasonOptions}
              />
              <Select
                allowClear
                placeholder="加 / 减"
                style={{ width: 120 }}
                value={recordFilters.type || undefined}
                onChange={value => setRecordFilter("type", value)}
                options={[
                  { value: "add", label: "加分" },
                  { value: "subtract", label: "扣分" },
                ]}
              />
              <Input
                type="date"
                style={{ width: 145 }}
                aria-label="开始日期"
                value={recordFilters.from}
                onChange={event => setRecordFilter("from", event.target.value)}
              />
              <span className="muted">至</span>
              <Input
                type="date"
                style={{ width: 145 }}
                aria-label="结束日期"
                value={recordFilters.to}
                onChange={event => setRecordFilter("to", event.target.value)}
              />
              <Button icon={<Download size={15} />} loading={exporting} onClick={exportRecords}>
                导出当前视图
              </Button>
            </div>
            <Table
              rowKey="id"
              dataSource={records}
              loading={recordsLoading}
              pagination={{
                current: recordPage,
                total: recordTotal,
                pageSize: 20,
                showSizeChanger: false,
              }}
              onChange={pagination => setRecordPage(pagination.current || 1)}
              columns={recordColumns(true)}
            />
          </>
        )}
      </div>
      <Modal
        title={editingStudent ? "编辑学生" : "添加学生"}
        open={studentModal}
        onCancel={() => setStudentModal(false)}
        onOk={() => studentForm.submit()}
        okText="保存"
      >
        <Form form={studentForm} layout="vertical" onFinish={saveStudent}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="no" label="学号">
            <Input />
          </Form.Item>
          <Form.Item name="sex" label="性别">
            <Select
              allowClear
              options={[
                { value: 0, label: "未知" },
                { value: 1, label: "男" },
                { value: 2, label: "女" },
              ]}
            />
          </Form.Item>
          <Form.Item name="groupId" label="组别">
            <Select allowClear options={groupOptions} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingGroup ? "编辑组别" : "新增组别"}
        open={groupModal}
        onCancel={() => setGroupModal(false)}
        onOk={() => groupForm.submit()}
        okText="保存"
      >
        <Form form={groupForm} layout="vertical" onFinish={saveGroup}>
          <Form.Item name="name" label="组名" rules={[{ required: true, message: "请输入组名" }]}>
            <Input placeholder="例如 第一组" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`${studentDetail?.student.name || ""} 的积分明细`}
        open={Boolean(studentDetail)}
        onCancel={() => setStudentDetail(undefined)}
        footer={
          <Button
            icon={<Download size={15} />}
            onClick={() =>
              studentDetail &&
              exportExcel(
                toDetailRows(studentDetail.records),
                `${studentDetail.student.name}-积分明细.xlsx`,
                "个人明细",
              )
            }
          >
            导出个人明细
          </Button>
        }
        width={800}
      >
        <Table
          rowKey="id"
          dataSource={studentDetail?.records || []}
          pagination={{ pageSize: 10 }}
          columns={recordColumns(false)}
        />
      </Modal>
      <Modal
        title="批量导入学生"
        open={importOpen}
        onCancel={closeImport}
        onOk={submitImport}
        okText="确认"
        cancelText="取消"
        confirmLoading={importing}
        closable={!importing}
        keyboard={!importing}
        maskClosable={!importing}
        cancelButtonProps={{ disabled: importing }}
        width={640}
      >
        <div style={{ marginBottom: 22 }}>
          <h4 style={{ margin: "0 0 9px" }}>格式说明</h4>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            文件列顺序为：姓名、学号、组别、性别、余额。
          </p>
          <div className="import-example">
            <Table
              size="small"
              showHeader={importHeader}
              pagination={false}
              rowKey="name"
              dataSource={[
                { name: "张三", no: "20250101", groupName: "第一组", sex: "男", balance: 12 },
                { name: "李四", no: "20250102", groupName: "第一组", sex: "女", balance: 8 },
                { name: "王五", no: "", groupName: "", sex: "", balance: 0 },
              ]}
              columns={[
                { title: "姓名", dataIndex: "name" },
                { title: "学号（可留空）", dataIndex: "no" },
                { title: "组别（可留空）", dataIndex: "groupName" },
                { title: "性别（可留空）", dataIndex: "sex" },
                { title: "余额（可留空）", dataIndex: "balance" },
              ]}
            />
          </div>
        </div>
        <div style={{ marginBottom: 22 }}>
          <h4 style={{ margin: "0 0 9px" }}>上传文件</h4>
          <Upload
            accept=".xlsx,.xls"
            maxCount={1}
            fileList={importFiles}
            beforeUpload={readImportFile}
            onChange={({ fileList }) => setImportFiles(fileList.slice(-1))}
            onRemove={() => {
              setImportFiles([]);
              setImportRawRows([]);
            }}
          >
            <Button type="primary" icon={<FileUp size={15} />}>
              选择文件
            </Button>
          </Upload>
        </div>
        <div>
          <h4 style={{ margin: "0 0 9px" }}>解析配置</h4>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9 }}>
            <Switch checked={importHeader} onChange={setImportHeader} />
            <span>我上传的文件含有表头行，当已有同名学生时</span>
            <Select<"skip" | "overwrite">
              value={importOnDuplicate}
              onChange={setImportOnDuplicate}
              style={{ width: 110 }}
              options={[
                { value: "skip", label: "跳过" },
                { value: "overwrite", label: "覆盖" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
