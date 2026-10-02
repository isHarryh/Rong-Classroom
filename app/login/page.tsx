"use client";

import { useState } from "react";
import { Alert, Button, DatePicker, Form, Input, Radio, Space } from "antd";
import { ArrowRight, KeyRound, Monitor, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { api } from "@/lib/client";

function nextTermDate() {
  const now = dayjs();
  const dates = [dayjs().month(1).date(1), dayjs().month(7).date(1)].filter(date => date.isAfter(now, "day"));
  return dates[0] || dayjs().add(1, "year").month(1).date(1);
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"admin" | "client">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expires, setExpires] = useState<"next" | "long">("next");
  const [form] = Form.useForm();

  async function submit(values: Record<string, unknown>) {
    setLoading(true);
    setError("");
    try {
      const expiresAt = mode === "client" ? (expires === "long" ? "long" : Number(values.expiresAt)) : undefined;
      const result = await api<{ kind: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ ...values, type: mode, expiresAt }),
      });
      router.push(result.kind === "client" ? "/client" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro">
        <div className="login-brand">
          <span className="brand-mark">榕</span>
          <h1>榕课堂</h1>
          <p>把每一次课堂表现，变成看得见的成长记录。为教师准备的班级积分工作台。</p>
        </div>
        <div className="login-note">Classroom credits, made clear.</div>
      </section>
      <section className="login-card-wrap">
        <div className="login-card">
          <h2>选择登录视角</h2>
          <p className="subtitle">选择访问端，开始今天的班级管理。</p>
          <Radio.Group
            className="login-switch"
            block
            value={mode}
            onChange={event => {
              setMode(event.target.value);
              form.resetFields();
              setError("");
            }}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="admin">
              <UserRound size={15} /> 教师管理端
            </Radio.Button>
            <Radio.Button value="client">
              <Monitor size={15} /> 教室设备端
            </Radio.Button>
          </Radio.Group>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 18 }} />}
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
            {mode === "admin" ? (
              <>
                <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }]}>
                  <Input
                    size="large"
                    prefix={<UserRound size={16} />}
                    placeholder="请输入教师用户名"
                    autoComplete="username"
                  />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
                  <Input.Password
                    size="large"
                    prefix={<KeyRound size={16} />}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item label="设备码" name="code" rules={[{ required: true, message: "请输入设备码" }]}>
                  <Input size="large" prefix={<Monitor size={16} />} placeholder="请输入 6 位大写英文字母" />
                </Form.Item>
                <Form.Item
                  label="解锁密码"
                  name="secret"
                  rules={[{ required: true, len: 6, message: "请输入 6 位数字密码" }]}
                >
                  <Input.Password
                    size="large"
                    prefix={<KeyRound size={16} />}
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="6 位数字"
                  />
                </Form.Item>
                <Form.Item label="本次登录有效期">
                  <Space orientation="vertical" style={{ width: "100%" }}>
                    <Radio.Group value={expires} onChange={event => setExpires(event.target.value)}>
                      <Radio value="next">到下一个学期节点</Radio>
                      <Radio value="long">长期有效</Radio>
                    </Radio.Group>
                    {expires === "next" && (
                      <Form.Item noStyle name="expiresAt" initialValue={nextTermDate()}>
                        <DatePicker
                          allowClear={false}
                          style={{ width: "100%" }}
                          disabledDate={date => date.isBefore(dayjs(), "day")}
                        />
                      </Form.Item>
                    )}
                  </Space>
                </Form.Item>
              </>
            )}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              icon={<ArrowRight size={17} />}
            >
              登录
            </Button>
          </Form>
        </div>
      </section>
    </main>
  );
}
