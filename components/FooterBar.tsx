"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import { ChartColumn, LockKeyhole, LogOut, Minus, MoreHorizontal, Plus, UnlockKeyhole, X } from "lucide-react";
import { fitSummary } from "@/lib/client";
import type { CreditTarget, ReasonStage, Student } from "@/lib/types";
import { CreditPopover, UnlockPopover } from "@/components/CreditPopovers";

// Footer of the classroom page: selection summary, credit buttons, stats entry
// and the session menu. Keeps its own summary measuring state.
export function FooterBar({
  students,
  selected,
  setSelected,
  unlocked,
  unlockAnchor,
  creditTarget,
  reasonStages,
  creditAmount,
  setCreditAmount,
  openCredit,
  resetLockTimer,
  unlock,
  setUnlockAnchor,
  setCreditTarget,
  submitCredit,
  handleUnlocked,
  lock,
  onStats,
  onLogout,
}: {
  students: Student[];
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  unlocked: boolean;
  unlockAnchor: string | undefined;
  creditTarget: CreditTarget | undefined;
  reasonStages: ReasonStage[];
  creditAmount: (key: string) => number;
  setCreditAmount: (key: string) => (value: number) => void;
  openCredit: (key: string, direction: 1 | -1, ids: string[], label?: string) => void;
  resetLockTimer: () => void;
  unlock: (secret: string) => Promise<string | undefined>;
  setUnlockAnchor: Dispatch<SetStateAction<string | undefined>>;
  setCreditTarget: Dispatch<SetStateAction<CreditTarget | undefined>>;
  submitCredit: (
    ids: string[],
    direction: 1 | -1,
    values: { amount: number; reasonId: string },
    origin?: { x: number; y: number },
  ) => void;
  handleUnlocked: () => void;
  lock: () => void;
  onStats: () => void;
  onLogout: () => void;
}) {
  const selectedNames = selected
    .map(id => students.find(student => student.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const [summaryEl, setSummaryEl] = useState<HTMLDivElement | null>(null);
  const [summaryWidth, setSummaryWidth] = useState(0);
  useEffect(() => {
    if (!summaryEl) return;
    const update = () => setSummaryWidth(summaryEl.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(summaryEl);
    return () => observer.disconnect();
  }, [summaryEl]);
  const summary = fitSummary(selectedNames, summaryEl, summaryWidth);
  return (
    <footer className="client-footer">
      <Button icon={<X size={15} />} onClick={() => setSelected([])} disabled={!selected.length}>
        清空选择
      </Button>
      <div className="selected-summary" ref={setSummaryEl}>
        {selected.length ? (
          <>
            <b>已选择：</b>
            {summary?.text}
            {summary?.suffix ?? ` 共 ${selected.length} 人`}
          </>
        ) : (
          "请选择需要操作的学生"
        )}
      </div>
      <div className="footer-actions">
        <div className={`credit-actions ${unlocked ? "" : "locked"}`}>
          <CreditPopover
            creditKey="footer-1"
            direction={1}
            ids={selected}
            placement="topRight"
            stages={reasonStages}
            amount={creditAmount("footer-1")}
            onAmountChange={setCreditAmount("footer-1")}
            onActivity={resetLockTimer}
            target={creditTarget}
            onClose={() => setCreditTarget(undefined)}
            onSubmit={(values, origin) => submitCredit(selected, 1, values, origin)}
          >
            <Tooltip title={unlocked && !selected.length ? "当前没有选中学生" : undefined}>
              <span className="credit-btn-wrap">
                <Button
                  type="primary"
                  className="credit-pair-btn"
                  disabled={!unlocked || !selected.length}
                  icon={<Plus size={15} />}
                  onClick={() => openCredit("footer-1", 1, selected)}
                >
                  加分
                </Button>
              </span>
            </Tooltip>
          </CreditPopover>
          <CreditPopover
            creditKey="footer--1"
            direction={-1}
            ids={selected}
            placement="topRight"
            stages={reasonStages}
            amount={creditAmount("footer--1")}
            onAmountChange={setCreditAmount("footer--1")}
            onActivity={resetLockTimer}
            target={creditTarget}
            onClose={() => setCreditTarget(undefined)}
            onSubmit={(values, origin) => submitCredit(selected, -1, values, origin)}
          >
            <Tooltip title={unlocked && !selected.length ? "当前没有选中学生" : undefined}>
              <span className="credit-btn-wrap">
                <Button
                  type="primary"
                  danger
                  className="credit-pair-btn"
                  disabled={!unlocked || !selected.length}
                  icon={<Minus size={15} />}
                  onClick={() => openCredit("footer--1", -1, selected)}
                >
                  扣分
                </Button>
              </span>
            </Tooltip>
          </CreditPopover>
          {!unlocked && (
            <UnlockPopover
              anchorKey="cta"
              anchor={unlockAnchor}
              unlock={unlock}
              onUnlocked={handleUnlocked}
              onClose={() => setUnlockAnchor(undefined)}
            >
              <Button
                type="primary"
                className="unlock-cta"
                icon={<UnlockKeyhole size={15} />}
                onClick={() => setUnlockAnchor(current => (current === "cta" ? undefined : "cta"))}
              >
                解锁以加减分
              </Button>
            </UnlockPopover>
          )}
        </div>
        <Button icon={<ChartColumn size={15} />} onClick={onStats}>
          数据统计
        </Button>
        <Dropdown
          trigger={["click"]}
          placement="topRight"
          menu={{
            items: [
              ...(unlocked
                ? [
                    {
                      key: "lock",
                      label: "立即锁定",
                      icon: <LockKeyhole size={15} />,
                      onClick: lock,
                    },
                  ]
                : []),
              { key: "logout", label: "注销登录", icon: <LogOut size={15} />, onClick: onLogout },
            ],
          }}
        >
          <Button type="text" icon={<MoreHorizontal size={15} />}>
            更多
          </Button>
        </Dropdown>
      </div>
    </footer>
  );
}
