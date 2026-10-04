"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spin } from "antd";
import { LayoutGrid, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, api, useMessage, useResource } from "@/lib/client";
import type { CreditTarget, Student } from "@/lib/types";
import { CreditCelebration, type CreditCelebrationEvent } from "@/components/CreditCelebration";
import { GroupingDialog } from "@/components/GroupingDialog";
import { StatsDialog } from "@/components/StatsDialog";
import { type ChipEffect } from "@/components/StudentChip";
import { StudentChips } from "@/components/StudentChips";
import { GroupSection } from "@/components/GroupSection";
import { FooterBar } from "@/components/FooterBar";
import { LoadError } from "@/components/LoadError";

const CHIP_EFFECT_LIMIT = 30;
const FEEDBACK_DURATION = 1600;

type Reason = { id: string; name: string; parentId?: string | null };
type Bootstrap = {
  client: { code: string };
  class: { id: string; name: string };
  groups: { id: string; name: string; status: number }[];
  students: Student[];
  reasons: Reason[];
};

export default function ClientPage() {
  const { message, notifyError } = useMessage();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockAnchor, setUnlockAnchor] = useState<string>();
  const [creditTarget, setCreditTarget] = useState<CreditTarget>();
  const [creditAmounts, setCreditAmounts] = useState<Record<string, number>>({});
  const creditAmount = (key: string) => creditAmounts[key] ?? 1;
  const setCreditAmount = (key: string) => (value: number) =>
    setCreditAmounts(current => ({ ...current, [key]: value }));
  const [celebration, setCelebration] = useState<CreditCelebrationEvent>();
  const [chipEffects, setChipEffects] = useState<Record<string, ChipEffect>>({});
  const [groupingOpen, setGroupingOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<{
    source?: Bootstrap;
    values: Record<string, string | null>;
  }>({ values: {} });
  const celebrationSeq = useRef(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [bootstrap, reload, , bootstrapError] = useResource(
    () => api<Bootstrap>("/api/client/bootstrap"),
    [],
    err => {
      notifyError(err, "加载失败");
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) router.replace("/");
    },
  );
  const [pending, setPending] = useState<{ source?: Bootstrap; deltas: Record<string, number> }>({ deltas: {} });
  const data = useMemo(() => {
    if (!bootstrap) return undefined;
    const deltas = pending.source === bootstrap ? pending.deltas : {};
    const overrides = groupOverrides.source === bootstrap ? groupOverrides.values : {};
    if (!Object.keys(deltas).length && !Object.keys(overrides).length) return bootstrap;
    return {
      ...bootstrap,
      students: bootstrap.students.map(student => {
        const delta = deltas[student.id];
        const groupId = overrides[student.id];
        if (delta === undefined && groupId === undefined) return student;
        return {
          ...student,
          balance: student.balance + (delta ?? 0),
          groupId: groupId === undefined ? student.groupId : (groupId ?? null),
        };
      }),
    };
  }, [bootstrap, pending, groupOverrides]);
  // Selection cannot outlive students that got removed or disabled (for example
  // after a partially failed credit submission). Adjusting state during render
  // is the officially sanctioned way to reconcile state with fresh data.
  if (data && selected.length) {
    const valid = selected.filter(id => data.students.some(student => student.id === id && student.status === 1));
    if (valid.length !== selected.length) setSelected(valid);
  }
  const keepaliveAt = useRef(0);
  const sendKeepalive = useCallback(() => {
    const now = Date.now();
    if (now - keepaliveAt.current < 60_000) return;
    keepaliveAt.current = now;
    void api("/api/client/keepalive", { method: "POST" }).catch(() => {});
  }, []);
  const resetLockTimer = useCallback(() => {
    clearTimeout(lockTimer.current);
    if (unlocked) {
      sendKeepalive();
      lockTimer.current = setTimeout(
        () => {
          setUnlocked(false);
          setCreditTarget(undefined);
          message.info("5 分钟无操作，已自动锁定");
        },
        5 * 60 * 1000,
      );
    }
  }, [unlocked, sendKeepalive, message]);
  const lock = useCallback(() => {
    setUnlocked(false);
    setCreditTarget(undefined);
  }, []);
  useEffect(() => {
    resetLockTimer();
    return () => clearTimeout(lockTimer.current);
  }, [resetLockTimer]);
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);
  function attemptWrite(action: () => void, anchor: string) {
    if (!unlocked) {
      setUnlockAnchor(current => (current === anchor ? undefined : anchor));
      return;
    }
    resetLockTimer();
    action();
  }
  function toggleStudent(id: string) {
    resetLockTimer();
    setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [id, ...current]));
  }
  function openCredit(key: string, direction: 1 | -1, ids: string[], label?: string) {
    if (!ids.length) {
      message.info("尚未选择学生");
      return;
    }
    attemptWrite(() => setCreditTarget({ key, direction, ids, label }), key);
  }
  const unlock = useCallback(
    async (secret: string): Promise<string | undefined> => {
      try {
        await api("/api/client/unlock", { method: "POST", body: JSON.stringify({ secret }) });
        return undefined;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) return "密码错误，请重试";
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/");
          return "登录状态已失效，请重新登录";
        }
        return err instanceof ApiError ? err.message : "网络异常，请稍后重试";
      }
    },
    [router],
  );
  const handleUnlocked = useCallback(() => {
    setUnlocked(true);
    setUnlockAnchor(undefined);
    message.success("已解锁，可进行积分操作");
  }, [message]);
  const submitting = useRef(false);
  async function submitCredit(
    ids: string[],
    direction: 1 | -1,
    values: { amount: number; reasonId: string },
    origin?: { x: number; y: number },
  ) {
    if (submitting.current) return;
    submitting.current = true;
    const amount = Number(values.amount);
    try {
      const result = await api<{ count: number }>("/api/credits", {
        method: "POST",
        body: JSON.stringify({
          studentIds: ids,
          delta: direction * amount,
          reasonId: values.reasonId,
        }),
      });
      if (result.count < ids.length) {
        message.warning(`部分学生已不可操作，实际生效 ${result.count} 人`);
        reload();
        return;
      }
      const key = ++celebrationSeq.current;
      setCelebration({ key, direction, amount, count: ids.length, label: creditTarget?.label, origin });
      if (ids.length <= CHIP_EFFECT_LIMIT) {
        const effects: Record<string, ChipEffect> = {};
        for (const id of ids) effects[id] = { key, direction, amount };
        setChipEffects(effects);
      } else {
        setChipEffects({});
      }
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => {
        setCelebration(undefined);
        setChipEffects({});
      }, FEEDBACK_DURATION);
      setCreditTarget(undefined);
      setSelected([]);
      setPending(current => {
        const next = { ...(current.source === bootstrap ? current.deltas : {}) };
        for (const id of ids) next[id] = (next[id] || 0) + direction * amount;
        return { source: bootstrap, deltas: next };
      });
      resetLockTimer();
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        lock();
        setUnlockAnchor("cta");
        message.warning("解锁已过期，请重新解锁");
        return;
      }
      notifyError(err, "提交失败");
    } finally {
      submitting.current = false;
    }
  }
  async function moveStudent(studentId: string, groupId: string | null) {
    const student = data?.students.find(item => item.id === studentId);
    if (!student) return;
    const previous = student.groupId ?? null;
    if (previous === groupId) return;
    const apply = (value: string | null) =>
      setGroupOverrides(current => ({
        source: bootstrap,
        values: { ...(current.source === bootstrap ? current.values : {}), [studentId]: value },
      }));
    apply(groupId);
    try {
      await api("/api/client/grouping", { method: "POST", body: JSON.stringify({ studentId, groupId }) });
      // Pull the authoritative bootstrap so optimistic overrides get replaced by
      // server state instead of lingering as a parallel truth.
      reload();
    } catch (err) {
      apply(previous);
      notifyError(err, "分组调整失败");
    }
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  const reasonStages = useMemo(() => {
    const reasons = data?.reasons || [];
    return reasons
      .filter(reason => !reason.parentId)
      .map(top => {
        const allChildren = reasons.filter(other => other.parentId === top.id);
        return {
          id: top.id,
          name: top.name,
          hasChildren: allChildren.length > 0,
          children: allChildren.map(child => ({ value: child.id, label: child.name })),
        };
      });
  }, [data]);
  if (!data) {
    if (bootstrapError) {
      return (
        <div className="app-loading">
          <LoadError title="教室端数据加载失败" onRetry={reload} />
        </div>
      );
    }
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    );
  }
  const activeStudents = data.students.filter(student => student.status === 1);
  const activeGroups = data.groups.filter(group => group.status === 1);
  const ungroupedStudents = activeStudents.filter(student => !activeGroups.some(group => group.id === student.groupId));
  return (
    <div className="client-layout">
      <header className="client-header">
        <div className="client-title">
          <h1>{data.class.name}</h1>
          <span>榕课堂教室端 · {data.client.code}</span>
        </div>
        <span className={`lock-status ${unlocked ? "open" : ""}`}>
          {unlocked ? <UnlockKeyhole size={16} /> : <LockKeyhole size={16} />}
          {unlocked ? "已解锁" : "已锁定"}
        </span>
      </header>
      <main className="client-body">
        <div className="client-section-heading">
          <div>
            <h2>小组学生列表</h2>
            <p>选中学生气泡后可在底部栏进行积分操作。</p>
          </div>
          <Button icon={<LayoutGrid size={15} />} onClick={() => setGroupingOpen(true)}>
            调整分组
          </Button>
        </div>
        {activeGroups.map(group => (
          <GroupSection
            key={group.id}
            group={group}
            students={activeStudents.filter(student => student.groupId === group.id)}
            selected={selected}
            setSelected={setSelected}
            unlocked={unlocked}
            unlockAnchor={unlockAnchor}
            creditTarget={creditTarget}
            reasonStages={reasonStages}
            chipEffects={chipEffects}
            creditAmount={creditAmount}
            setCreditAmount={setCreditAmount}
            openCredit={openCredit}
            toggleStudent={toggleStudent}
            resetLockTimer={resetLockTimer}
            unlock={unlock}
            setUnlockAnchor={setUnlockAnchor}
            setCreditTarget={setCreditTarget}
            submitCredit={(ids, direction, values, origin) => submitCredit(ids, direction, values, origin)}
            handleUnlocked={handleUnlocked}
          />
        ))}
        {ungroupedStudents.length > 0 && (
          <section className="group-block">
            <div className="group-header">
              <strong>
                未分组 <span className="muted">· {ungroupedStudents.length} 人</span>
              </strong>
            </div>
            <StudentChips
              students={ungroupedStudents}
              selected={selected}
              chipEffects={chipEffects}
              onToggle={toggleStudent}
            />
          </section>
        )}
      </main>
      <FooterBar
        students={activeStudents}
        selected={selected}
        setSelected={setSelected}
        unlocked={unlocked}
        unlockAnchor={unlockAnchor}
        creditTarget={creditTarget}
        reasonStages={reasonStages}
        creditAmount={creditAmount}
        setCreditAmount={setCreditAmount}
        openCredit={openCredit}
        resetLockTimer={resetLockTimer}
        unlock={unlock}
        setUnlockAnchor={setUnlockAnchor}
        setCreditTarget={setCreditTarget}
        submitCredit={submitCredit}
        handleUnlocked={handleUnlocked}
        lock={lock}
        onStats={() => setStatsOpen(true)}
        onLogout={logout}
      />
      <GroupingDialog
        open={groupingOpen}
        groups={activeGroups}
        students={activeStudents.map(student => ({ id: student.id, name: student.name, groupId: student.groupId }))}
        onClose={() => setGroupingOpen(false)}
        onMove={moveStudent}
      />
      <StatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} />
      <CreditCelebration event={celebration} />
    </div>
  );
}
