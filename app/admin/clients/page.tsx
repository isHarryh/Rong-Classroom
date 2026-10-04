"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Form, Input, Modal, Select, Table } from "antd";
import { Copy, Edit3, Eye, EyeOff, KeyRound, Plus } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { LoadError } from "@/components/LoadError";
import { DeletedToggle, StatusActions } from "@/components/StatusActions";
import { api, formatTime, useEditModal, useMessage, useResource } from "@/lib/client";
import type { ClassSummary } from "@/lib/types";

type ClientItem = {
  id: string;
  code: string;
  secret: string;
  classId: string;
  className: string;
  status: number;
  activeAt?: number;
  createdAt: number;
};

export default function ClientsPage() {
  const { message, notifyError } = useMessage();
  const [created, setCreated] = useState<{ code: string; secret: string }>();
  const [deleted, setDeleted] = useState(false);
  const [form] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);
  const secretModal = useEditModal<ClientItem>();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [data, reload, loading, loadError] = useResource(
    async () => (await api<{ clients: ClientItem[] }>(`/api/admin/clients?includeDeleted=${deleted}`)).clients,
    [deleted],
  );
  const [classes = []] = useResource(
    async () => (await api<{ classes: ClassSummary[] }>("/api/admin/classes")).classes,
    [],
  );
  const items = data || [];
  async function create(values: Record<string, unknown>) {
    try {
      const result = await api<{ client: { code: string; secret: string } }>("/api/admin/clients", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setCreated(result.client);
      form.resetFields();
      reload();
    } catch (err) {
      notifyError(err, "创建失败");
    }
  }
  async function toggleStatus(id: string, status: number) {
    try {
      await api("/api/admin/clients", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "status", status }),
      });
      message.success("状态已更新");
      reload();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  async function updateSecret(values: { secret: string }) {
    if (!secretModal.editing) return;
    try {
      await api("/api/admin/clients", {
        method: "PATCH",
        body: JSON.stringify({ id: secretModal.editing.id, secret: values.secret }),
      });
      message.success("解锁密码已更新");
      secretModal.closeModal();
      reload();
    } catch (err) {
      notifyError(err, "更新失败");
    }
  }
  async function copy(value: string) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      message.success("已复制");
    } catch {
      message.error("复制失败，请手动复制");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>设备管理</h1>
          <p>为教室电脑创建固定设备凭据，管理绑定班级和解锁密码。</p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={15} />}
          onClick={() => {
            setCreated(undefined);
            form.resetFields();
            setCreateOpen(true);
          }}
        >
          新增设备
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
              {
                title: "设备码",
                dataIndex: "code",
                render: value => <b style={{ letterSpacing: 1 }}>{value}</b>,
              },
              {
                title: "解锁密码",
                dataIndex: "secret",
                render: (value, item) => (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ letterSpacing: 1 }}>{revealed[item.id] ? value : "••••••"}</span>
                    <Button
                      type="text"
                      icon={revealed[item.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                      title={revealed[item.id] ? "隐藏密码" : "显示密码"}
                      onClick={() => setRevealed(current => ({ ...current, [item.id]: !current[item.id] }))}
                    />
                  </span>
                ),
              },
              {
                title: "绑定班级",
                dataIndex: "className",
                render: (value, item) => (
                  <Link href={`/admin/classes/${item.classId}`} style={{ color: "var(--green)", fontWeight: 600 }}>
                    {value}
                  </Link>
                ),
              },
              {
                title: "状态",
                dataIndex: "status",
                render: value => <StatusTag value={value} disabledLabel="停用" />,
              },
              {
                title: "最近活跃",
                dataIndex: "activeAt",
                render: value => formatTime(value),
              },
              {
                title: "操作",
                render: (_, item) => (
                  <div className="inline-actions">
                    <Button
                      type="text"
                      icon={<Edit3 size={15} />}
                      title="修改解锁密码"
                      onClick={() => secretModal.openModal(item, { secret: "" })}
                    />
                    <StatusActions
                      status={item.status}
                      onToggle={() => toggleStatus(item.id, item.status === 1 ? 0 : 1)}
                      deleteConfirm="设备将进入回收站。"
                      onDelete={() => toggleStatus(item.id, 2)}
                      disableLabel="停用"
                      enableLabel="恢复"
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
        <DeletedToggle checked={deleted} onChange={setDeleted} label="显示已删除凭据" />
      </div>
      <Modal
        title={created ? "设备创建成功" : "新增教室设备"}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          if (created) {
            setCreateOpen(false);
            setCreated(undefined);
          } else form.submit();
        }}
        okText={created ? "完成" : "创建"}
        cancelButtonProps={{ style: created ? { display: "none" } : undefined }}
      >
        {created ? (
          <div className="login-help">
            <p style={{ marginTop: 0 }}>请将以下信息配置到对应的教室电脑。解锁密码只在创建时展示，请妥善保存。</p>
            <p>
              <b>设备码：</b>
              {created.code} <Button type="text" icon={<Copy size={15} />} onClick={() => copy(created.code)} />
            </p>
            <p>
              <b>解锁密码：</b>
              {created.secret} <Button type="text" icon={<Copy size={15} />} onClick={() => copy(created.secret)} />
            </p>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={create}>
            <Form.Item name="classId" label="绑定班级" rules={[{ required: true, message: "请选择班级" }]}>
              <Select options={classes.map(item => ({ value: item.id, label: item.name }))} />
            </Form.Item>
            <Form.Item
              name="secret"
              label="解锁密码"
              rules={[
                { required: true, len: 6, message: "请输入 6 位数字" },
                { pattern: /^\d{6}$/, message: "只能输入数字" },
              ]}
            >
              <Input.Password maxLength={6} prefix={<KeyRound size={15} />} inputMode="numeric" />
            </Form.Item>
          </Form>
        )}
      </Modal>
      <Modal
        title={`修改 ${secretModal.editing?.code || ""} 的解锁密码`}
        open={secretModal.open}
        onCancel={secretModal.closeModal}
        onOk={() => secretModal.form.submit()}
        okText="保存"
      >
        <Form form={secretModal.form} layout="vertical" onFinish={updateSecret}>
          <Form.Item
            name="secret"
            label="新解锁密码"
            rules={[
              { required: true, len: 6, message: "请输入 6 位数字" },
              { pattern: /^\d{6}$/, message: "只能输入数字" },
            ]}
          >
            <Input.Password maxLength={6} prefix={<KeyRound size={15} />} inputMode="numeric" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
