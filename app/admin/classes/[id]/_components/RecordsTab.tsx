"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select, Table } from "antd";
import { Download } from "lucide-react";
import { api, useMessage, useResource } from "@/lib/client";
import type { Student } from "@/lib/types";
import { exportExcel, recordColumns, toSheetRows, type RecordItem } from "./record-helpers";

// Records tab with its own filters, pagination and export. Mounts only when the
// tab is active, so switching tabs is the trigger for loading fresh data.
export function RecordsTab({
  classId,
  classLabel,
  students,
  reasonOptions,
  onStudentClick,
}: {
  classId: string;
  classLabel: string;
  students: Student[];
  reasonOptions: { value: string; label: string }[];
  onStudentClick: (student: { id: string; name: string }) => void;
}) {
  const { message, notifyError } = useMessage();
  const [recordFilters, setRecordFilters] = useState({
    studentId: "",
    reasonId: "",
    type: "",
    from: "",
    to: "",
  });
  const [recordPage, setRecordPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const recordQuery = useMemo(
    () => new URLSearchParams({ ...recordFilters, page: String(recordPage), pageSize: "20" }),
    [recordFilters, recordPage],
  );
  const [recordsData = { records: [] as RecordItem[], total: 0 }, , recordsLoading] = useResource(
    () => api<{ records: RecordItem[]; total: number }>(`/api/admin/classes/${classId}/records?${recordQuery}`),
    [classId, recordQuery],
  );
  const records = recordsData.records;
  const recordTotal = recordsData.total;
  function setRecordFilter(key: keyof typeof recordFilters, value?: string) {
    setRecordPage(1);
    setRecordFilters(current => ({ ...current, [key]: value || "" }));
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
    if (exporting) return;
    setExporting(true);
    try {
      const all = await fetchAllRecords();
      exportExcel(toSheetRows(all, true), `${classLabel}-积分记录.xlsx`, "积分记录");
      message.success(`已导出 ${all.length} 条记录`);
    } catch (err) {
      notifyError(err, "导出失败");
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="data-toolbar">
        <Select
          allowClear
          placeholder="学生"
          style={{ width: 150 }}
          value={recordFilters.studentId || undefined}
          onChange={value => setRecordFilter("studentId", value)}
          options={students.map(s => ({
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
        columns={recordColumns(true, onStudentClick)}
      />
    </>
  );
}
