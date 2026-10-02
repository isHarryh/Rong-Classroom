"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Table, Tag } from "antd";
import { Edit3, Plus } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { api, useMessage, useResource } from "@/lib/client";

type Account = {
  id: string;
  name: string;
  username: string;
  role: number;
  status: number;
};

export default function AccountsPage() {
  const { message, notifyError } = useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account>();
  const [form] = Form.useForm();
  const [items = [], reload, loading] = useResource(
    async () => (await api<{ accounts: Account[] }>("/api/admin/accounts")).accounts,
    [],
  );
  async function save(values: Record<string, unknown>) {
    try {
      await api("/api/admin/accounts", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(editing ? { id: editing.id, ...values } : values),
      });
      message.success("账号已保存");
      setOpen(false);
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function toggle(item: Account) {
    try {
      await api("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          id: item.id,
          action: "status",
          status: item.status === 1 ? 0 : 1,
        }),
      });
      reload();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>账号管理</h1>
          <p>仅超级管理员可新增、修改和禁用教师账号。</p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setEditing(undefined);
            form.resetFields();
            setOpen(true);
          }}
        >
          新增教师
        </Button>
      </div>
      <div className="section-panel">
        <Table
          rowKey="id"
          dataSource={items}
          loading={loading}
          columns={[
            { title: "姓名", dataIndex: "name" },
            { title: "用户名", dataIndex: "username" },
            {
              title: "角色",
              dataIndex: "role",
              render: value => (value === 1 ? <Tag color="blue">超级管理员</Tag> : <Tag>普通教师</Tag>),
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
                      setEditing(item);
                      form.resetFields();
                      form.setFieldsValue({ name: item.name });
                      setOpen(true);
                    }}
                  />
                  <Popconfirm
                    title={item.status === 1 ? "禁用这个账号？" : "启用这个账号？"}
                    onConfirm={() => toggle(item)}
                  >
                    <Button type="text">{item.status === 1 ? "禁用" : "启用"}</Button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </div>
      <Modal
        title={editing ? "编辑教师" : "新增教师"}
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="保存"
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="username"
              label="用户名"
              preserve={false}
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="password"
            label={editing ? "新密码（留空则不修改）" : "密码"}
            preserve={false}
            rules={editing ? [] : [{ required: true, min: 6, message: "至少 6 位密码" }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
