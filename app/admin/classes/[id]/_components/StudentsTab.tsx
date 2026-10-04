"use client";

import { Button, Table } from "antd";
import { Edit3, UserRound } from "lucide-react";
import { ManOutlined, WomanOutlined } from "@ant-design/icons";
import { StatusTag } from "@/components/StatusTag";
import { DeletedToggle, StatusActions } from "@/components/StatusActions";
import type { Student } from "@/lib/types";
import { ImportDialog } from "./ImportDialog";
import type { Bundle } from "./record-helpers";

export function StudentsTab({
  bundle,
  studentModal,
  showDeleted,
  setShowDeleted,
  onRefresh,
  onStudentStatus,
}: {
  bundle: Bundle;
  studentModal: {
    open: boolean;
    editing: Student | undefined;
    form: { submit: () => void };
    openModal: (record?: Student) => void;
    closeModal: () => void;
  };
  showDeleted: boolean;
  setShowDeleted: (value: boolean) => void;
  onRefresh: () => void;
  onStudentStatus: (id: string, status: number) => void;
}) {
  return (
    <>
      <div className="data-toolbar">
        <ImportDialog classId={bundle.class.id} onImported={onRefresh} />
        <Button icon={<UserRound size={16} />} onClick={() => studentModal.openModal()}>
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
                <Button type="text" icon={<Edit3 size={15} />} onClick={() => studentModal.openModal(item)} />
                <StatusActions
                  status={item.status}
                  onToggle={() => onStudentStatus(item.id, item.status === 1 ? 0 : 1)}
                  deleteConfirm="学生将进入回收站，历史记录仍会保留。"
                  onDelete={() => onStudentStatus(item.id, 2)}
                  enableLabel="启用"
                />
              </div>
            ),
          },
        ]}
      />
      <DeletedToggle checked={showDeleted} onChange={setShowDeleted} label="显示已删除学生" />
    </>
  );
}
