"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ConfigProvider, Slider } from "antd";
import { Minus, Plus, X } from "lucide-react";
import { useMessage } from "@/lib/client";
import type { CreditValues, ReasonStage } from "@/lib/types";

export function CreditFormPanel({
  direction,
  amount,
  onAmountChange,
  stages,
  onActivity,
  onCancel,
  onOk,
}: {
  direction: 1 | -1;
  amount: number;
  onAmountChange: (value: number) => void;
  stages: ReasonStage[];
  onActivity: () => void;
  onCancel: () => void;
  onOk: (values: CreditValues, origin?: { x: number; y: number }) => void;
}) {
  const { message } = useMessage();
  const [topId, setTopId] = useState<string>();
  const [reasonId, setReasonId] = useState<string>();
  const [shake, setShake] = useState<{ target: "top" | "child"; key: number }>();
  const stage2Ref = useRef<HTMLDivElement>(null);
  const active = stages.find(stage => stage.id === topId);
  useEffect(() => {
    if (active?.hasChildren) stage2Ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [topId, active?.hasChildren]);
  return (
    <div style={{ width: 320 }}>
      <div className="credit-amount-row">
        <span className="muted">分值</span>
        <b className={`credit-amount ${direction > 0 ? "balance-positive" : "balance-negative"}`}>
          {direction > 0 ? "+" : "-"}
          {amount} 分
        </b>
      </div>
      <ConfigProvider theme={{ token: { colorPrimary: direction > 0 ? "#176b5d" : "#bb4d4d" } }}>
        <Slider
          min={1}
          max={10}
          step={1}
          marks={{ 1: "1", 10: "10" }}
          value={amount}
          onChange={value => {
            onActivity();
            onAmountChange(value);
          }}
        />
      </ConfigProvider>
      <div className="credit-label" style={{ marginTop: 12 }}>
        加减分原因
      </div>
      <div className="reason-picker">
        <div
          className={`reason-group-options ${shake?.target === "top" ? "shake" : ""}`}
          key={shake?.target === "top" ? `top-${shake.key}` : "top"}
        >
          {stages.map(stage => (
            <button
              type="button"
              className={`reason-chip ${topId === stage.id ? "selected" : ""} ${direction < 0 ? "danger" : ""}`}
              key={stage.id}
              onClick={() => {
                onActivity();
                setTopId(stage.id);
                setReasonId(stage.hasChildren ? undefined : stage.id);
              }}
            >
              {stage.name}
            </button>
          ))}
        </div>
        {active?.hasChildren && (
          <div className="reason-stage2" ref={stage2Ref}>
            <div className="reason-group-name">{active.name} · 二级原因</div>
            {active.children.length ? (
              <div
                className={`reason-group-options ${shake?.target === "child" ? "shake" : ""}`}
                key={shake?.target === "child" ? `child-${shake.key}` : "child"}
              >
                {active.children.map(option => (
                  <button
                    type="button"
                    className={`reason-chip ${reasonId === option.value ? "selected" : ""} ${
                      direction < 0 ? "danger" : ""
                    }`}
                    key={option.value}
                    onClick={() => {
                      onActivity();
                      setReasonId(option.value);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="reason-group-name">暂无可选的二级原因</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button icon={<X size={15} />} onClick={onCancel}>
          取消
        </Button>
        <Button
          type="primary"
          danger={direction < 0}
          icon={direction > 0 ? <Plus size={15} /> : <Minus size={15} />}
          style={{ flex: 1 }}
          onClick={event => {
            if (!reasonId) {
              const target = active?.hasChildren ? "child" : "top";
              setShake(current => ({ target, key: (current?.key ?? 0) + 1 }));
              message.warning("请选择原因");
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            onOk(
              { amount, reasonId },
              {
                x: (rect.left + rect.width / 2) / window.innerWidth,
                y: (rect.top + rect.height / 2) / window.innerHeight,
              },
            );
          }}
        >
          {direction > 0 ? "确认加分" : "确认扣分"}
        </Button>
      </div>
    </div>
  );
}
