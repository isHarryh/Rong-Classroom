"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Form, Input, Modal, Select, Table } from "antd";
import { Edit3, Eye, Plus } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { LoadError } from "@/components/LoadError";
import { DeletedToggle, StatusActions } from "@/components/StatusActions";
import { api, formatTerm, useEditModal, useMessage, useResource } from "@/lib/client";
import type { ClassItem } from "@/lib/types";

export default function ClassesPage() {
  const { message, notifyError } = useMessage();
  const [deleted, setDeleted] = useState(false);
  const modal = useEditModal<ClassItem>();
  const [items = [], reload, loading, loadError] = useResource(
    async () => (await api<{ classes: ClassItem[] }>(`/api/admin/classes?includeDeleted=${deleted}`)).classes,
    [deleted],
  );
  function open(item?: ClassItem) {
    modal.openModal(item, item ? undefined : { termYear: new Date().getFullYear(), termNum: 1 });
  }
  async function submit(values: Record<string, unknown>) {
    try {
      if (modal.editing)
        await api(`/api/admin/classes/${modal.editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      else
        await api("/api/admin/classes", {
          method: "POST",
          body: JSON.stringify(values),
        });
      message.success("保存成功");
      modal.closeModal();
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function toggleStatus(id: string, status: number) {
    try {
      await api(`/api/admin/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "status", status }),
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
          <h1>班级管理</h1>
          <p>维护班级档案、学期标识与日常数据入口。</p>
        </div>
        <div className="heading-actions">
          <Button icon={<Plus size={15} />} type="primary" onClick={() => open()}>
            新建班级
          </Button>
        </div>
      </div>
      <div className="section-panel">
        {loadError ? (
          <LoadError onRetry={reload} />
        ) : (
          <Table
            rowKey="id"
            dataSource={items}
            loading={loading}
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: "班级",
                dataIndex: "name",
                render: (value, item) => (
                  <Link href={`/admin/classes/${item.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>
                    {value}
                  </Link>
                ),
              },
              { title: "学期", render: (_, item) => formatTerm(item.termYear, item.termNum) },
              {
                title: "学生",
                dataIndex: "studentCount",
                render: value => `${value} 人`,
              },
              {
                title: "组别",
                dataIndex: "groupCount",
                render: value => `${value} 组`,
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
                    <Button type="text" icon={<Eye size={15} />} title="查看详情" href={`/admin/classes/${item.id}`} />
                    <Button type="text" icon={<Edit3 size={15} />} title="编辑" onClick={() => open(item)} />
                    <StatusActions
                      status={item.status}
                      onToggle={() => toggleStatus(item.id, item.status === 1 ? 0 : 1)}
                      deleteConfirm="班级将进入回收站，可恢复。"
                      onDelete={() => toggleStatus(item.id, 2)}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
        <DeletedToggle checked={deleted} onChange={setDeleted} label="显示已删除班级" />
      </div>
      <Modal
        title={modal.editing ? "编辑班级" : "新建班级"}
        open={modal.open}
        onCancel={modal.closeModal}
        onOk={() => modal.form.submit()}
        okText="保存"
      >
        <Form form={modal.form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="班级名称" rules={[{ required: true, message: "请输入班级名称" }]}>
            <Input placeholder="例如 三年级一班" />
          </Form.Item>
          <Form.Item name="termYear" label="学年起始年份" rules={[{ required: true, message: "请输入学年" }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="termNum" label="学期号" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 1, label: "第 1 学期" },
                { value: 2, label: "第 2 学期" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
