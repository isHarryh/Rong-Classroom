"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Form, Input, Modal, Popconfirm, Select, Switch, Table } from "antd";
import { Edit3, Eye, Plus, RotateCcw, Trash2 } from "lucide-react";
import { StatusTag } from "@/components/StatusTag";
import { api, useMessage, useResource } from "@/lib/client";

type ClassItem = {
  id: string;
  name: string;
  termYear: number;
  termNum: number;
  status: number;
  studentCount: number;
  groupCount: number;
};

export default function ClassesPage() {
  const { message, notifyError } = useMessage();
  const [deleted, setDeleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem>();
  const [form] = Form.useForm();
  const [items = [], reload, loading] = useResource(
    async () => (await api<{ classes: ClassItem[] }>(`/api/admin/classes?includeDeleted=${deleted}`)).classes,
    [deleted],
  );
  function open(item?: ClassItem) {
    setEditing(item);
    if (item) form.setFieldsValue(item);
    else {
      form.resetFields();
      form.setFieldsValue({ termYear: new Date().getFullYear(), termNum: 1 });
    }
    setModalOpen(true);
  }
  async function submit(values: Record<string, unknown>) {
    try {
      if (editing)
        await api(`/api/admin/classes/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      else
        await api("/api/admin/classes", {
          method: "POST",
          body: JSON.stringify(values),
        });
      message.success("保存成功");
      setModalOpen(false);
      reload();
    } catch (err) {
      notifyError(err, "保存失败");
    }
  }
  async function setStatus(id: string, status: number) {
    try {
      await api(`/api/admin/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "status", status }),
      });
      message.success(status === 2 ? "已移入回收站" : "状态已更新");
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
          <Button icon={<Plus size={16} />} type="primary" onClick={() => open()}>
            新建班级
          </Button>
        </div>
      </div>
      <div className="section-panel">
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
            {
              title: "学期",
              render: (_, item) => `${item.termYear}-${item.termYear + 1} 学年第 ${item.termNum} 学期`,
            },
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
                  <Button type="text" icon={<Eye size={16} />} title="查看详情" href={`/admin/classes/${item.id}`} />
                  <Button type="text" icon={<Edit3 size={16} />} title="编辑" onClick={() => open(item)} />
                  {item.status === 2 ? (
                    <Popconfirm title="恢复这个班级？" onConfirm={() => setStatus(item.id, 1)}>
                      <Button type="text" icon={<RotateCcw size={16} />} />
                    </Popconfirm>
                  ) : (
                    <>
                      <Button type="text" onClick={() => setStatus(item.id, item.status === 1 ? 0 : 1)}>
                        {item.status === 1 ? "禁用" : "启用"}
                      </Button>
                      <Popconfirm title="班级将进入回收站，可恢复。" onConfirm={() => setStatus(item.id, 2)}>
                        <Button danger type="text" icon={<Trash2 size={16} />} />
                      </Popconfirm>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
        <div className="data-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <Switch checked={deleted} onChange={setDeleted} />
          <span className="muted">显示已删除班级</span>
        </div>
      </div>
      <Modal
        title={editing ? "编辑班级" : "新建班级"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="保存"
      >
        <Form form={form} layout="vertical" onFinish={submit}>
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
