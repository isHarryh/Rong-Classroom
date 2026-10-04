"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Divider, Empty, Modal, Segmented, Spin, Table, Tabs } from "antd";
import { ChevronLeft, ChevronRight, TrendingUp, Trophy } from "lucide-react";
import { api, useResource } from "@/lib/client";

const Column = dynamic(() => import("@ant-design/plots").then(mod => mod.Column), { ssr: false });

type Period = "all" | "month" | "week";
type GroupStat = { id: string | null; name: string; total: number; average: number; students: number };
type StarItem = { id: string; name: string; value: number };
type ProgressItem = StarItem & { rate: number | null };
type ReasonItem = { name: string; value: number };
type Stats = {
  period: Period;
  label: string;
  prevAnchor: string | null;
  nextAnchor: string | null;
  groups: GroupStat[];
  stars: StarItem[];
  progress: ProgressItem[] | null;
  reasons: { positive: ReasonItem[]; negative: ReasonItem[] };
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
const rateText = (rate: number | null) =>
  rate === null ? "新增" : `${rate >= 0 ? "↑" : "↓"} ${(Math.abs(rate) * 100).toFixed(1)}%`;
const chartLabel = () => ({ text: "value", position: "top", dy: -14, fill: "#1f2d2b", fontSize: 11 });
const chartTooltip = (name: string) => ({ items: [{ field: "value", name }] });

function rankMap(values: number[]) {
  const sorted = [...new Set(values)].sort((a, b) => b - a);
  return (value: number) => sorted.indexOf(value) + 1;
}

function rankGroups<T>(items: T[], same: (a: T, b: T) => boolean) {
  const groups: { rank: number; items: T[] }[] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && same(last.items[0], item)) last.items.push(item);
    else groups.push({ rank: index + 1, items: [item] });
  });
  return groups;
}

type PodiumItem = StarItem & { rate?: number | null };

function PodiumCards({ items, showRate }: { items: PodiumItem[]; showRate: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [rowHeight, setRowHeight] = useState<number>();
  const [hasMore, setHasMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (expanded) return;
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !first) return;
    setRowHeight(first.offsetHeight);
    setHasMore(el.scrollHeight > first.offsetHeight + 1);
  }, [items, expanded]);
  return (
    <>
      <div ref={ref} className="stats-podium-cards" style={{ maxHeight: expanded ? undefined : rowHeight }}>
        {items.map(item => (
          <div className="stats-podium-card" key={item.id}>
            <span className="name">{item.name}</span>
            <span className="value">{signed(item.value)} 分</span>
            {showRate && <span className="rate">{rateText(item.rate ?? null)}</span>}
          </div>
        ))}
      </div>
      {(hasMore || expanded) && (
        <div className="stats-podium-more">
          {!expanded && <span className="muted">等共 {items.length} 人</span>}
          <Button type="link" size="small" onClick={() => setExpanded(value => !value)}>
            {expanded ? "收起" : "展开"}
          </Button>
        </div>
      )}
    </>
  );
}

function Podium({
  items,
  same,
  showRate,
}: {
  items: PodiumItem[];
  same: (a: PodiumItem, b: PodiumItem) => boolean;
  showRate: boolean;
}) {
  const groups = rankGroups(items, same);
  return (
    <div className="stats-podium">
      {[2, 1, 3].map(slot => {
        const group = groups.find(item => item.rank === slot);
        return (
          <div key={slot} className={`stats-podium-slot slot-${slot}`}>
            {group && <PodiumCards items={group.items} showRate={showRate} />}
            <div className="stats-podium-step">{slot}</div>
          </div>
        );
      })}
    </div>
  );
}

export function StatsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("all");
  const [anchor, setAnchor] = useState<string>();
  const [metric, setMetric] = useState<"total" | "average">("total");
  const query = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period !== "all" && anchor) params.set("anchor", anchor);
    return params.toString();
  }, [period, anchor]);
  const [stats] = useResource(
    () => (open ? api<Stats>(`/api/client/stats?${query}`) : Promise.resolve(undefined)),
    [open, query],
  );
  const groupRows = useMemo(() => {
    if (!stats) return [];
    const totalRank = rankMap(stats.groups.map(group => group.total));
    const averageRank = rankMap(stats.groups.map(group => group.average));
    return [...stats.groups]
      .sort((a, b) => (metric === "total" ? b.total - a.total : b.average - a.average))
      .map(group => ({ ...group, totalRank: totalRank(group.total), averageRank: averageRank(group.average) }));
  }, [stats, metric]);
  const groupChart = useMemo(() => {
    if (!stats) return [];
    return stats.groups.map(group => ({
      name: group.name,
      value: metric === "total" ? group.total : round1(group.average),
    }));
  }, [stats, metric]);
  const starTitle = period === "all" ? "累计之星" : period === "month" ? "每月之星" : "每周之星";
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      title="数据统计"
      styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}
    >
      <div className="stats-toolbar">
        <Segmented
          value={period}
          onChange={value => {
            setPeriod(value as Period);
            setAnchor(undefined);
          }}
          options={[
            { label: "累计", value: "all" },
            { label: "月小计", value: "month" },
            { label: "周小计", value: "week" },
          ]}
        />
        {period !== "all" && (
          <div className="stats-period-nav">
            <Button
              icon={<ChevronLeft size={14} />}
              disabled={!stats?.prevAnchor}
              onClick={() => stats?.prevAnchor && setAnchor(stats.prevAnchor)}
            />
            <b>{stats?.label ?? ""}</b>
            <Button
              icon={<ChevronRight size={14} />}
              disabled={!stats?.nextAnchor}
              onClick={() => stats?.nextAnchor && setAnchor(stats.nextAnchor)}
            />
          </div>
        )}
      </div>
      {!stats ? (
        <div className="stats-loading">
          <Spin />
        </div>
      ) : (
        <Tabs
          destroyOnHidden
          items={[
            {
              key: "groups",
              label: "小组累计榜",
              children: (
                <>
                  <div className="stats-metric-toggle">
                    <Segmented
                      value={metric}
                      onChange={value => setMetric(value as "total" | "average")}
                      options={[
                        { label: "总分", value: "total" },
                        { label: "平均分", value: "average" },
                      ]}
                    />
                  </div>
                  <Column
                    data={groupChart}
                    xField="name"
                    yField="value"
                    height={240}
                    color="#176b5d"
                    label={chartLabel()}
                    tooltip={chartTooltip(metric === "total" ? "总分" : "平均分")}
                  />
                  <Table
                    size="small"
                    rowKey={record => record.id ?? "__ungrouped__"}
                    dataSource={groupRows}
                    pagination={false}
                    columns={[
                      { title: "小组", dataIndex: "name", render: value => <b>{value}</b> },
                      { title: "人数", dataIndex: "students", align: "right" },
                      { title: "总分", dataIndex: "total", align: "right" },
                      { title: "总分排行", dataIndex: "totalRank", align: "right" },
                      {
                        title: "平均分",
                        dataIndex: "average",
                        align: "right",
                        render: value => round1(value),
                      },
                      { title: "平均分排行", dataIndex: "averageRank", align: "right" },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "personal",
              label: "个人成就榜",
              children: (
                <>
                  <div className="stats-achievement">
                    <h4 className="stats-achievement-title star">
                      <Trophy size={15} />
                      {starTitle}
                    </h4>
                    {stats.stars.length ? (
                      <Podium
                        key={`${query}-star`}
                        items={stats.stars}
                        same={(a, b) => a.value === b.value}
                        showRate={false}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期暂无数据" />
                    )}
                  </div>
                  {stats.progress && (
                    <>
                      <Divider className="stats-achievement-divider" />
                      <div className="stats-achievement">
                        <h4 className="stats-achievement-title progress">
                          <TrendingUp size={15} />
                          进步之星
                        </h4>
                        {stats.progress.length ? (
                          <Podium
                            key={`${query}-progress`}
                            items={stats.progress}
                            same={(a, b) =>
                              (a.rate === null ? Infinity : a.rate) === (b.rate === null ? Infinity : b.rate)
                            }
                            showRate
                          />
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期暂无数据" />
                        )}
                      </div>
                    </>
                  )}
                </>
              ),
            },
            {
              key: "reasons",
              label: "积分原因统计",
              children: (
                <>
                  <div className="stats-reason-section">
                    <h4>加分原因 TOP10</h4>
                    {stats.reasons.positive.length ? (
                      <Column
                        data={stats.reasons.positive}
                        xField="name"
                        yField="value"
                        height={240}
                        color="#176b5d"
                        label={chartLabel()}
                        tooltip={chartTooltip("加分")}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期暂无数据" />
                    )}
                  </div>
                  <div className="stats-reason-section">
                    <h4>扣分原因 TOP10</h4>
                    {stats.reasons.negative.length ? (
                      <Column
                        data={stats.reasons.negative}
                        xField="name"
                        yField="value"
                        height={240}
                        color="#bb4d4d"
                        label={chartLabel()}
                        tooltip={chartTooltip("扣分")}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期暂无数据" />
                    )}
                  </div>
                </>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
}
