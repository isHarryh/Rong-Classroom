"use client";

import { useMemo, useState } from "react";
import { Alert, Select, Spin } from "antd";
import { ArrowDown, ArrowUp, Grid2x2, Users } from "lucide-react";
import { api, useResource } from "@/lib/client";
import { LoadError } from "@/components/LoadError";
import type { ClassItem } from "@/lib/types";

type Metrics = {
  positive: number;
  negative: number;
};

export default function DashboardPage() {
  const [selected, setSelected] = useState("");
  const [classes = [], reloadClasses, classesLoading, classesError] = useResource(
    async () => (await api<{ classes: ClassItem[] }>("/api/admin/classes")).classes,
    [],
  );
  const classId = selected || classes[0]?.id || "";
  const [metrics, reloadMetrics, metricsLoading, metricsError] = useResource(
    async () => (classId ? await api<Metrics>(`/api/admin/dashboard?classId=${classId}`) : undefined),
    [classId],
  );
  const loading = classesLoading || metricsLoading;
  const current = useMemo(
    () => (classesError ? undefined : classes.find(item => item.id === classId)),
    [classes, classId, classesError],
  );
  const cards =
    metrics && current
      ? [
          {
            label: "学生总数",
            value: current.studentCount ?? 0,
            icon: Users,
            className: "",
          },
          {
            label: "小组总数",
            value: current.groupCount ?? 0,
            icon: Grid2x2,
            className: "",
          },
          {
            label: "累计加分",
            value: `+${metrics.positive}`,
            icon: ArrowUp,
            className: "balance-positive",
          },
          {
            label: "累计扣分",
            value: `-${metrics.negative}`,
            icon: ArrowDown,
            className: "balance-negative",
          },
        ]
      : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>数据看板</h1>
          <p>查看班级积分变化，掌握日常表现趋势。</p>
        </div>
        <div className="heading-actions">
          <Select
            value={classId || undefined}
            onChange={setSelected}
            placeholder="选择班级"
            style={{ width: 210 }}
            options={classes.map(item => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>
      </div>
      {loading && !current ? (
        <div className="empty-state">
          <Spin />
        </div>
      ) : classesError ? (
        <LoadError title="班级列表加载失败" onRetry={reloadClasses} />
      ) : metricsError ? (
        <LoadError title="指标加载失败" onRetry={reloadMetrics} />
      ) : !current ? (
        <Alert type="info" showIcon title="还没有可用班级" description="请先在班级管理中创建一个班级。" />
      ) : (
        <div className="metric-grid">
          {cards.map(({ label, value, icon: Icon, className }) => (
            <div className="metric-card" key={label}>
              <div className="metric-label">
                <Icon size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
                {label}
              </div>
              <div className={`metric-value ${className}`}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
