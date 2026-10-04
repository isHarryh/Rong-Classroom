"use client";

import { Form, Input, Modal, Select } from "antd";
import type { FormInstance } from "antd";
import type { Student } from "@/lib/types";

export function StudentModal({
  open,
  editing,
  form,
  groupOptions,
  onCancel,
  onOk,
  onFinish,
}: {
  open: boolean;
  editing: Student | undefined;
  form: FormInstance;
  groupOptions: { value: string; label: string }[];
  onCancel: () => void;
  onOk: () => void;
  onFinish: (values: Record<string, unknown>) => void;
}) {
  return (
    <Modal title={editing ? "编辑学生" : "添加学生"} open={open} onCancel={onCancel} onOk={onOk} okText="保存">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="no" label="学号">
          <Input />
        </Form.Item>
        <Form.Item name="sex" label="性别" initialValue={0}>
          <Select
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
  );
}
