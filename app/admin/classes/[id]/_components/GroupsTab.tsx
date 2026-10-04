"use client";

import { Button, Table } from "antd";
import { ArrowDown, ArrowUp, Edit3, LayoutGrid, Plus } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { DeletedToggle, StatusActions } from "@/components/StatusActions";
import type { GroupItem } from "@/lib/types";

export function GroupsTab({
  groups,
  groupModal,
  showDeleted,
  setShowDeleted,
  onOpenGrouping,
  onGroupAction,
}: {
  groups: GroupItem[];
  groupModal: {
    editing: GroupItem | undefined;
    form: { submit: () => void };
    openModal: (record?: GroupItem) => void;
  };
  showDeleted: boolean;
  setShowDeleted: (value: boolean) => void;
  onOpenGrouping: () => void;
  onGroupAction: (groupId: string, action: string, extra?: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div className="data-toolbar">
        <Button type="primary" icon={<Plus size={15} />} onClick={() => groupModal.openModal()}>
          新增组别
        </Button>
        <Button icon={<LayoutGrid size={15} />} onClick={onOpenGrouping}>
          调整分组
        </Button>
      </div>
      <Table
        rowKey="id"
        dataSource={groups}
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
                  title="上移"
                  onClick={() => onGroupAction(item.id, "move", { direction: "up" })}
                />
                <Button
                  type="text"
                  icon={<ArrowDown size={15} />}
                  title="下移"
                  onClick={() => onGroupAction(item.id, "move", { direction: "down" })}
                />
                <Button type="text" icon={<Edit3 size={15} />} onClick={() => groupModal.openModal(item)} />
                <StatusActions
                  status={item.status}
                  onToggle={() => onGroupAction(item.id, "status", { status: item.status === 1 ? 0 : 1 })}
                  deleteConfirm="组别将进入回收站，组内学生会保留。"
                  onDelete={() => onGroupAction(item.id, "status", { status: 2 })}
                />
              </div>
            ),
          },
        ]}
      />
      <DeletedToggle checked={showDeleted} onChange={setShowDeleted} label="显示已删除组别" />
    </>
  );
}
