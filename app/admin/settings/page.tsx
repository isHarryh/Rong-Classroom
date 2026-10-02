"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag } from "antd";
import { ArrowDown, ArrowUp, Edit3, Plus, RotateCcw, Trash2 } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { api, useMessage, useResource } from "@/lib/client";

type Reason = {
  id: string;
  name: string;
  parentId?: string | null;
  status: number;
};

export default function SettingsPage() {
  const { message, notifyError } = useMessage();
  const [showDeleted, setShowDeleted] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reason>();
  const [form] = Form.useForm();
  const [reasons = [], reload, loading] = useResource(
    async () => (await api<{ reasons: Reason[] }>("/api/admin/reasons")).reasons,
    [],
  );
  async function save(values: Record<string, unknown>) {
    try {
      await api("/api/admin/reasons", {
        method: "POST",
        body: JSON.stringify({
          action: editing ? "update" : "create",
          id: editing?.id,
          ...values,
        }),
      });
      message.success("原因已保存");
      setOpen(false);
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function action(body: Record<string, unknown>) {
    try {
      await api("/api/admin/reasons", {
        method: "POST",
        body: JSON.stringify(body),
      });
      reload();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  const visible = reasons.filter(reason => showDeleted || reason.status !== 2);
  const topReasons = reasons.filter(reason => !reason.parentId && reason.status !== 2);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>原因设置</h1>
          <p>全局维护加分和扣分原因，配置对所有班级生效。</p>
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
          新增原因
        </Button>
      </div>
      <div className="section-panel">
        <Table
          rowKey="id"
          dataSource={visible}
          loading={loading}
          pagination={false}
          columns={[
            {
              title: "原因名称",
              render: (_, item) => (
                <span style={{ paddingLeft: item.parentId ? 28 : 0 }}>
                  {item.parentId ? "└ " : ""}
                  <b>{item.name}</b>
                </span>
              ),
            },
            {
              title: "层级",
              render: (_, item) => (item.parentId ? <Tag>二级</Tag> : <Tag color="blue">一级</Tag>),
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
                    onClick={() => action({ action: "move", id: item.id, direction: "up" })}
                  />
                  <Button
                    type="text"
                    icon={<ArrowDown size={15} />}
                    onClick={() => action({ action: "move", id: item.id, direction: "down" })}
                  />
                  <Button
                    type="text"
                    icon={<Edit3 size={15} />}
                    onClick={() => {
                      setEditing(item);
                      form.setFieldsValue(item);
                      setOpen(true);
                    }}
                  />
                  {item.status === 2 ? (
                    <Button
                      type="text"
                      icon={<RotateCcw size={15} />}
                      onClick={() => action({ action: "status", id: item.id, status: 1 })}
                    />
                  ) : (
                    <>
                      <Button
                        type="text"
                        onClick={() =>
                          action({
                            action: "status",
                            id: item.id,
                            status: item.status === 1 ? 0 : 1,
                          })
                        }
                      >
                        {item.status === 1 ? "禁用" : "启用"}
                      </Button>
                      <Popconfirm
                        title="原因将进入回收站，历史记录仍保留快照。"
                        onConfirm={() => action({ action: "status", id: item.id, status: 2 })}
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
          <span className="muted">显示已删除原因</span>
        </div>
      </div>
      <Modal
        title={editing ? "编辑原因" : "新增原因"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="保存"
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入原因名称" }]}>
            <Input />
          </Form.Item>
          {!editing && (
            <Form.Item name="parentId" label="上级原因">
              <Select
                allowClear
                placeholder="不选择则为一级原因"
                options={topReasons.map(reason => ({
                  value: reason.id,
                  label: reason.name,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
