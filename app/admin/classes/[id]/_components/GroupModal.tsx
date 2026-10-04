"use client";

import { Form, Input, Modal } from "antd";
import type { FormInstance } from "antd";
import type { GroupItem } from "@/lib/types";

export function GroupModal({
  open,
  editing,
  form,
  onCancel,
  onOk,
  onFinish,
}: {
  open: boolean;
  editing: GroupItem | undefined;
  form: FormInstance;
  onCancel: () => void;
  onOk: () => void;
  onFinish: (values: Record<string, unknown>) => void;
}) {
  return (
    <Modal title={editing ? "编辑组别" : "新增组别"} open={open} onCancel={onCancel} onOk={onOk} okText="保存">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="组名" rules={[{ required: true, message: "请输入组名" }]}>
          <Input placeholder="例如 第一组" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
