"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "antd";
import { Minus, Plus, UsersRound } from "lucide-react";
import type { CreditTarget, ReasonStage, Student } from "@/lib/types";
import type { ChipEffect } from "@/components/StudentChip";
import { CreditPopover, UnlockPopover } from "@/components/CreditPopovers";
import { StudentChips } from "@/components/StudentChips";

// One group block (header actions plus student chips). Group-wide credits share
// the "group-1"/"group--1" amount keys across all groups by design.
export function GroupSection({
  group,
  students,
  selected,
  setSelected,
  unlocked,
  unlockAnchor,
  creditTarget,
  reasonStages,
  chipEffects,
  creditAmount,
  setCreditAmount,
  openCredit,
  toggleStudent,
  resetLockTimer,
  unlock,
  setUnlockAnchor,
  setCreditTarget,
  submitCredit,
  handleUnlocked,
}: {
  group: { id: string; name: string };
  students: Student[];
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  unlocked: boolean;
  unlockAnchor: string | undefined;
  creditTarget: CreditTarget | undefined;
  reasonStages: ReasonStage[];
  chipEffects: Record<string, ChipEffect>;
  creditAmount: (key: string) => number;
  setCreditAmount: (key: string) => (value: number) => void;
  openCredit: (key: string, direction: 1 | -1, ids: string[], label?: string) => void;
  toggleStudent: (id: string) => void;
  resetLockTimer: () => void;
  unlock: (secret: string) => Promise<string | undefined>;
  setUnlockAnchor: (anchor: string | undefined) => void;
  setCreditTarget: (target: CreditTarget | undefined) => void;
  submitCredit: (
    ids: string[],
    direction: 1 | -1,
    values: { amount: number; reasonId: string },
    origin?: { x: number; y: number },
  ) => void;
  handleUnlocked: () => void;
}) {
  const groupIds = students.map(student => student.id);
  const groupSelected = students.length > 0 && students.every(student => selected.includes(student.id));
  const plusButton = (
    <Button
      size="small"
      type="text"
      icon={<Plus size={14} />}
      onClick={() => openCredit(`group-${group.id}-1`, 1, groupIds, group.name)}
    >
      整组加分
    </Button>
  );
  const minusButton = (
    <Button
      size="small"
      type="text"
      danger
      icon={<Minus size={14} />}
      onClick={() => openCredit(`group-${group.id}--1`, -1, groupIds, group.name)}
    >
      整组扣分
    </Button>
  );
  return (
    <section className="group-block">
      <div className="group-header">
        <strong>
          {group.name} <span className="muted">· {students.length} 人</span>
        </strong>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            size="small"
            icon={<UsersRound size={14} />}
            onClick={() => {
              resetLockTimer();
              setSelected(current =>
                groupSelected
                  ? current.filter(id => !students.some(student => student.id === id))
                  : [...groupIds, ...current.filter(id => !students.some(student => student.id === id))],
              );
            }}
          >
            {groupSelected ? "取消全选" : "选择全组"}
          </Button>
          {unlocked ? (
            <CreditPopover
              creditKey={`group-${group.id}-1`}
              direction={1}
              ids={groupIds}
              placement="bottomRight"
              stages={reasonStages}
              amount={creditAmount("group-1")}
              onAmountChange={setCreditAmount("group-1")}
              onActivity={resetLockTimer}
              target={creditTarget}
              onClose={() => setCreditTarget(undefined)}
              onSubmit={(values, origin) => submitCredit(groupIds, 1, values, origin)}
            >
              {plusButton}
            </CreditPopover>
          ) : (
            <UnlockPopover
              anchorKey={`group-${group.id}-1`}
              anchor={unlockAnchor}
              unlock={unlock}
              onUnlocked={() => {
                handleUnlocked();
                if (groupIds.length)
                  setCreditTarget({
                    key: `group-${group.id}-1`,
                    direction: 1,
                    ids: groupIds,
                    label: group.name,
                  });
              }}
              onClose={() => setUnlockAnchor(undefined)}
            >
              {plusButton}
            </UnlockPopover>
          )}
          {unlocked ? (
            <CreditPopover
              creditKey={`group-${group.id}--1`}
              direction={-1}
              ids={groupIds}
              placement="bottomRight"
              stages={reasonStages}
              amount={creditAmount("group--1")}
              onAmountChange={setCreditAmount("group--1")}
              onActivity={resetLockTimer}
              target={creditTarget}
              onClose={() => setCreditTarget(undefined)}
              onSubmit={(values, origin) => submitCredit(groupIds, -1, values, origin)}
            >
              {minusButton}
            </CreditPopover>
          ) : (
            <UnlockPopover
              anchorKey={`group-${group.id}--1`}
              anchor={unlockAnchor}
              unlock={unlock}
              onUnlocked={() => {
                handleUnlocked();
                if (groupIds.length)
                  setCreditTarget({
                    key: `group-${group.id}--1`,
                    direction: -1,
                    ids: groupIds,
                    label: group.name,
                  });
              }}
              onClose={() => setUnlockAnchor(undefined)}
            >
              {minusButton}
            </UnlockPopover>
          )}
        </div>
      </div>
      <StudentChips students={students} selected={selected} chipEffects={chipEffects} onToggle={toggleStudent} />
      {!students.length && (
        <div className="muted" style={{ padding: "8px 0" }}>
          暂无启用学生
        </div>
      )}
    </section>
  );
}
