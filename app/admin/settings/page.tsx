"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, Select, Table, Tag } from "antd";
import { ArrowDown, ArrowUp, Edit3, Plus } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { LoadError } from "@/components/LoadError";
import { DeletedToggle, StatusActions } from "@/components/StatusActions";
import { api, reasonLabel, useEditModal, useMessage, useResource } from "@/lib/client";
import type { Reason } from "@/lib/types";

export default function SettingsPage() {
  const { message, notifyError } = useMessage();
  const [showDeleted, setShowDeleted] = useState(false);
  const modal = useEditModal<Reason>();
  const [reasons = [], reload, loading, loadError] = useResource(
    async () => (await api<{ reasons: Reason[] }>("/api/admin/reasons")).reasons,
    [],
  );
  async function save(values: Record<string, unknown>) {
    try {
      await api("/api/admin/reasons", {
        method: "POST",
        body: JSON.stringify({
          action: modal.editing ? "update" : "create",
          id: modal.editing?.id,
          ...values,
        }),
      });
      message.success("原因已保存");
      modal.closeModal();
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function toggleStatus(id: string, status: number) {
    try {
      await api("/api/admin/reasons", {
        method: "POST",
        body: JSON.stringify({ action: "status", id, status }),
      });
      message.success("状态已更新");
      reload();
    } catch (err) {
      notifyError(err, "操作失败");
    }
  }
  async function move(id: string, direction: "up" | "down") {
    try {
      await api("/api/admin/reasons", {
        method: "POST",
        body: JSON.stringify({ action: "move", id, direction }),
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
        <Button type="primary" icon={<Plus size={15} />} onClick={() => modal.openModal()}>
          新增原因
        </Button>
      </div>
      <div className="section-panel">
        {loadError ? (
          <LoadError onRetry={reload} />
        ) : (
          <Table
            rowKey="id"
            dataSource={visible}
            loading={loading}
            pagination={false}
            columns={[
              {
                title: "原因名称",
                render: (_, item) => <b>{reasonLabel(item)}</b>,
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
                    <Button type="text" icon={<ArrowUp size={15} />} title="上移" onClick={() => move(item.id, "up")} />
                    <Button
                      type="text"
                      icon={<ArrowDown size={15} />}
                      title="下移"
                      onClick={() => move(item.id, "down")}
                    />
                    <Button type="text" icon={<Edit3 size={15} />} title="编辑" onClick={() => modal.openModal(item)} />
                    <StatusActions
                      status={item.status}
                      onToggle={() => toggleStatus(item.id, item.status === 1 ? 0 : 1)}
                      deleteConfirm="原因将进入回收站，历史记录仍保留快照。"
                      onDelete={() => toggleStatus(item.id, 2)}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
        <DeletedToggle checked={showDeleted} onChange={setShowDeleted} label="显示已删除原因" />
      </div>
      <Modal
        title={modal.editing ? "编辑原因" : "新增原因"}
        open={modal.open}
        onCancel={modal.closeModal}
        onOk={() => modal.form.submit()}
        okText="保存"
      >
        <Form form={modal.form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入原因名称" }]}>
            <Input />
          </Form.Item>
          {!modal.editing && (
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
