"use client";

import { Button } from "antd";
import type { TableColumnsType } from "antd";
import * as XLSX from "xlsx";
import { formatTime } from "@/lib/client";
import type { Student } from "@/lib/types";

export type RecordItem = {
  id: string;
  studentId: string;
  studentName: string;
  reasonName: string;
  groupName: string;
  delta: number;
  createdAt: number;
};

export function exportExcel(rows: object[], filename: string, sheetName: string) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheetName);
  XLSX.writeFile(book, filename);
}

// Column order follows the two historical layouts: band list keeps 学生 first,
// personal detail keeps 时间 first.
export function toSheetRows(items: RecordItem[], withStudent: boolean) {
  return items.map(item => {
    if (withStudent)
      return {
        学生: item.studentName,
        组别: item.groupName,
        原因: item.reasonName,
        变化: item.delta,
        时间: formatTime(item.createdAt),
      };
    return {
      时间: formatTime(item.createdAt),
      组别: item.groupName,
      原因: item.reasonName,
      变化: item.delta,
    };
  });
}

export function recordColumns(
  withStudent: boolean,
  onStudentClick?: (student: { id: string; name: string }) => void,
): TableColumnsType<RecordItem> {
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
        <Button type="link" onClick={() => onStudentClick?.({ id: item.studentId, name: item.studentName })}>
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

export type Bundle = {
  class: {
    id: string;
    name: string;
    termYear: number;
    termNum: number;
  };
  groups: { id: string; name: string; classId?: string; status: number }[];
  students: Student[];
};
