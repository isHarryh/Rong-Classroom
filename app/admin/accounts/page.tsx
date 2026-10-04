"use client";

import { Button, Form, Input, Modal, Table, Tag } from "antd";
import { Edit3, Plus } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { LoadError } from "@/components/LoadError";
import { StatusActions } from "@/components/StatusActions";
import { api, useEditModal, useMessage, useResource } from "@/lib/client";

type Account = {
  id: string;
  name: string;
  username: string;
  role: number;
  status: number;
};

export default function AccountsPage() {
  const { message, notifyError } = useMessage();
  const modal = useEditModal<Account>();
  const [items = [], reload, loading, loadError] = useResource(
    async () => (await api<{ accounts: Account[] }>("/api/admin/accounts")).accounts,
    [],
  );
  async function save(values: Record<string, unknown>) {
    try {
      await api("/api/admin/accounts", {
        method: modal.editing ? "PATCH" : "POST",
        body: JSON.stringify(modal.editing ? { id: modal.editing.id, ...values } : values),
      });
      message.success("账号已保存");
      modal.closeModal();
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function toggleStatus(id: string, status: number) {
    try {
      await api("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          action: "status",
          status,
        }),
      });
      message.success("状态已更新");
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
        <Button type="primary" icon={<Plus size={15} />} onClick={() => modal.openModal()}>
          新增教师
        </Button>
      </div>
      <div className="section-panel">
        {loadError ? (
          <LoadError onRetry={reload} />
        ) : (
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
                    <Button type="text" icon={<Edit3 size={15} />} title="编辑" onClick={() => modal.openModal(item)} />
                    <StatusActions
                      status={item.status}
                      onToggle={() => toggleStatus(item.id, item.status === 1 ? 0 : 1)}
                      toggleConfirm={item.status === 1 ? "禁用这个账号？" : "启用这个账号？"}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
      <Modal
        title={modal.editing ? "编辑教师" : "新增教师"}
        open={modal.open}
        onCancel={modal.closeModal}
        onOk={() => modal.form.submit()}
        okText="保存"
      >
        <Form form={modal.form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          {!modal.editing && (
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
            label={modal.editing ? "新密码（留空则不修改）" : "密码"}
            preserve={false}
            rules={modal.editing ? [] : [{ required: true, min: 6, message: "至少 6 位密码" }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
