"use client";

import { Popover } from "antd";
import { CreditFormPanel } from "@/components/CreditFormPanel";
import { UnlockPanel } from "@/components/UnlockPanel";
import type { CreditTarget, CreditValues, ReasonStage } from "@/lib/types";

export function UnlockPopover({
  anchorKey,
  anchor,
  unlock,
  onUnlocked,
  onClose,
  children,
}: {
  anchorKey: string;
  anchor: string | undefined;
  unlock: (secret: string) => Promise<string | undefined>;
  onUnlocked: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const open = anchor === anchorKey;
  return (
    <Popover
      trigger="click"
      placement={anchorKey === "cta" ? "topRight" : "bottomRight"}
      open={open}
      onOpenChange={value => !value && onClose()}
      content={open ? <UnlockPanel onSubmit={unlock} onSuccess={onUnlocked} /> : null}
    >
      {children}
    </Popover>
  );
}

export function CreditPopover({
  creditKey,
  direction,
  ids,
  placement,
  stages,
  amount,
  onAmountChange,
  onActivity,
  target,
  onClose,
  onSubmit,
  children,
}: {
  creditKey: string;
  direction: 1 | -1;
  ids: string[];
  placement: "topRight" | "bottomRight";
  stages: ReasonStage[];
  amount: number;
  onAmountChange: (value: number) => void;
  onActivity: () => void;
  target: CreditTarget | undefined;
  onClose: () => void;
  onSubmit: (values: CreditValues, origin?: { x: number; y: number }) => void;
  children: React.ReactNode;
}) {
  const open = target?.key === creditKey;
  return (
    <Popover
      trigger="click"
      placement={placement}
      title={`${direction > 0 ? "加分" : "扣分"} · ${ids.length} 名学生`}
      open={open}
      onOpenChange={value => !value && onClose()}
      content={
        open ? (
          <CreditFormPanel
            direction={direction}
            amount={amount}
            onAmountChange={onAmountChange}
            stages={stages}
            onActivity={onActivity}
            onCancel={onClose}
            onOk={onSubmit}
          />
        ) : null
      }
    >
      {children}
    </Popover>
  );
}
