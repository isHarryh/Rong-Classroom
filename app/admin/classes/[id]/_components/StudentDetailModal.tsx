"use client";

import { Button, Modal, Table } from "antd";
import { Download } from "lucide-react";
import { exportExcel, recordColumns, toSheetRows, type RecordItem } from "./record-helpers";

export type StudentDetail = {
  student: { id: string; name: string };
  records: RecordItem[];
};

export function StudentDetailModal({ detail, onClose }: { detail?: StudentDetail; onClose: () => void }) {
  return (
    <Modal
      title={`${detail?.student.name || ""} 的积分明细`}
      open={Boolean(detail)}
      onCancel={onClose}
      footer={
        <Button
          icon={<Download size={15} />}
          onClick={() =>
            detail &&
            exportExcel(toSheetRows(detail.records, false), `${detail.student.name}-积分明细.xlsx`, "个人明细")
          }
        >
          导出个人明细
        </Button>
      }
      width={800}
    >
      <Table
        rowKey="id"
        dataSource={detail?.records || []}
        pagination={{ pageSize: 10 }}
        columns={recordColumns(false)}
      />
    </Modal>
  );
}
