"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfigProvider, Dropdown, Popover, Slider, Spin } from "antd";
import { Delete, LockKeyhole, LogOut, Minus, MoreHorizontal, Plus, UnlockKeyhole, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, useMessage, useResource, ApiError } from "@/lib/client";

type Group = { id: string; name: string; status: number };
type Student = {
  id: string;
  name: string;
  groupId?: string;
  status: number;
  balance: number;
};
type Reason = {
  id: string;
  name: string;
  parentId?: string | null;
};
type Bootstrap = {
  client: { code: string };
  class: { id: string; name: string };
  groups: Group[];
  students: Student[];
  reasons: Reason[];
};
type CreditValues = { amount: number; reasonId: string };
type CreditTarget = { key: string; direction: 1 | -1; ids: string[] };
type ReasonStage = { id: string; name: string; hasChildren: boolean; children: { value: string; label: string }[] };

function CreditFormPanel({
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
  onOk: (values: CreditValues) => void;
}) {
  const { message } = useMessage();
  const [topId, setTopId] = useState<string>();
  const [reasonId, setReasonId] = useState<string>();
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
        <div className="reason-group-options">
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
              <div className="reason-group-options">
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
          onClick={() => (reasonId ? onOk({ amount, reasonId }) : message.warning("请选择原因"))}
        >
          {direction > 0 ? "确认加分" : "确认扣分"}
        </Button>
      </div>
    </div>
  );
}

type UnlockStatus = "idle" | "loading" | "success" | "error";

function UnlockPanel({
  onSubmit,
  onSuccess,
}: {
  onSubmit: (secret: string) => Promise<string | undefined>;
  onSuccess: () => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<UnlockStatus>("idle");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const successTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    inputRef.current?.focus();
    return () => window.clearTimeout(successTimer.current);
  }, []);
  const submit = async (secret: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStatus("loading");
    try {
      const errorText = await onSubmit(secret);
      if (errorText) {
        setStatus("error");
        setError(errorText);
        setValue("");
        inputRef.current?.focus();
        return;
      }
      setStatus("success");
      successTimer.current = window.setTimeout(onSuccess, 600);
    } finally {
      submittingRef.current = false;
    }
  };
  const press = (digit: string) => {
    if (submittingRef.current || status === "success") return;
    setStatus("idle");
    if (value.length >= 6) return;
    const next = `${value}${digit}`;
    setValue(next);
    if (next.length === 6) void submit(next);
  };
  const clear = () => {
    if (submittingRef.current || status === "success") return;
    setStatus("idle");
    setValue("");
  };
  const backspace = () => {
    if (submittingRef.current || status === "success") return;
    setStatus("idle");
    setValue(current => current.slice(0, -1));
  };
  return (
    <div style={{ width: 280 }}>
      <div className={`unlock-otp ${status}`}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`otp-cell ${focused && index === value.length ? "active" : ""}`}>
            {value[index] ? "•" : ""}
          </div>
        ))}
        <input
          ref={inputRef}
          className="otp-hidden-input"
          value={value}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={event => {
            if (submittingRef.current || status === "success") return;
            setStatus("idle");
            const next = event.target.value.replace(/\D/g, "").slice(0, 6);
            setValue(next);
            if (next.length === 6) void submit(next);
          }}
        />
      </div>
      <div className={`unlock-status ${status}`}>
        {status === "loading" && (
          <>
            <Spin size="small" />
            <span>正在验证…</span>
          </>
        )}
        {status === "error" && <span>{error}</span>}
        {status === "success" && <span>验证成功</span>}
      </div>
      <div className="numpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
          <Button key={digit} disabled={status === "loading"} onClick={() => press(digit)}>
            {digit}
          </Button>
        ))}
        <Button disabled={status === "loading"} onClick={clear}>
          清空
        </Button>
        <Button disabled={status === "loading"} onClick={() => press("0")}>
          0
        </Button>
        <Button disabled={status === "loading"} icon={<Delete size={15} />} onClick={backspace} />
      </div>
    </div>
  );
}

function UnlockPopover({
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

function CreditPopover({
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
  onSubmit: (values: CreditValues) => void;
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

function fitSummary(names: string[], el: HTMLDivElement | null, width: number) {
  if (!names.length || !el || !width) return null;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  const style = getComputedStyle(el);
  context.font = `700 ${style.fontSize} ${style.fontFamily}`;
  const prefixWidth = context.measureText("已选择：").width;
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const suffixOf = (truncated: boolean) => (truncated ? ` 等共 ${names.length} 人` : ` 共 ${names.length} 人`);
  let count = names.length;
  for (; count > 0; count--) {
    const text = names.slice(0, count).join("、") + suffixOf(count < names.length);
    if (prefixWidth + context.measureText(text).width <= width) break;
  }
  const truncated = count < names.length;
  return { text: names.slice(0, count).join("、"), suffix: suffixOf(truncated) };
}

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
  const [summaryEl, setSummaryEl] = useState<HTMLDivElement | null>(null);
  const [summaryWidth, setSummaryWidth] = useState(0);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [bootstrap, reload] = useResource(
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
    if (!Object.keys(deltas).length) return bootstrap;
    return {
      ...bootstrap,
      students: bootstrap.students.map(student =>
        deltas[student.id] === undefined ? student : { ...student, balance: student.balance + deltas[student.id] },
      ),
    };
  }, [bootstrap, pending]);
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
  useEffect(() => {
    if (!summaryEl) return;
    const update = () => setSummaryWidth(summaryEl.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(summaryEl);
    return () => observer.disconnect();
  }, [summaryEl]);
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
  function openCredit(key: string, direction: 1 | -1, ids: string[]) {
    if (!ids.length) {
      message.info("尚未选择学生");
      return;
    }
    attemptWrite(() => setCreditTarget({ key, direction, ids }), key);
  }
  const unlock = useCallback(
    async (secret: string): Promise<string | undefined> => {
      try {
        await api("/api/client/unlock", { method: "POST", body: JSON.stringify({ secret }) });
        return undefined;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) return "密码错误，请重试";
        router.replace("/");
        return "登录状态已失效，请重新登录";
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
  async function submitCredit(ids: string[], direction: 1 | -1, values: CreditValues) {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const result = await api<{ count: number }>("/api/credits", {
        method: "POST",
        body: JSON.stringify({
          studentIds: ids,
          delta: direction * Number(values.amount),
          reasonId: values.reasonId,
        }),
      });
      if (result.count < ids.length) {
        message.warning(`部分学生已不可操作，实际生效 ${result.count} 人`);
        reload();
        return;
      }
      message.success(`已为 ${ids.length} 名学生${direction > 0 ? "加分" : "扣分"}`);
      setCreditTarget(undefined);
      setSelected([]);
      setPending(current => {
        const next = { ...(current.source === bootstrap ? current.deltas : {}) };
        for (const id of ids) next[id] = (next[id] || 0) + direction * Number(values.amount);
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
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  const reasonStages = useMemo<ReasonStage[]>(() => {
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
  if (!data)
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    );
  const activeStudents = data.students.filter(student => student.status === 1);
  const activeGroups = data.groups.filter(group => group.status === 1);
  const ungroupedStudents = activeStudents.filter(student => !activeGroups.some(group => group.id === student.groupId));
  const selectedNames = selected
    .map(id => activeStudents.find(student => student.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const summary = fitSummary(selectedNames, summaryEl, summaryWidth);
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
          <h1>小组学生列表</h1>
          <p>选中学生气泡后可在底部栏进行积分操作。</p>
        </div>
        {activeGroups.map(group => {
          const students = activeStudents.filter(student => student.groupId === group.id);
          const groupIds = students.map(student => student.id);
          const groupSelected = students.length > 0 && students.every(student => selected.includes(student.id));
          const plusButton = (
            <Button
              size="small"
              type="text"
              icon={<Plus size={14} />}
              onClick={() => openCredit(`group-${group.id}-1`, 1, groupIds)}
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
              onClick={() => openCredit(`group-${group.id}--1`, -1, groupIds)}
            >
              整组扣分
            </Button>
          );
          return (
            <section className="group-block" key={group.id}>
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
                      onSubmit={values => submitCredit(groupIds, 1, values)}
                    >
                      {plusButton}
                    </CreditPopover>
                  ) : (
                    <UnlockPopover
                      anchorKey={`group-${group.id}-1`}
                      anchor={unlockAnchor}
                      unlock={unlock}
                      onUnlocked={handleUnlocked}
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
                      onSubmit={values => submitCredit(groupIds, -1, values)}
                    >
                      {minusButton}
                    </CreditPopover>
                  ) : (
                    <UnlockPopover
                      anchorKey={`group-${group.id}--1`}
                      anchor={unlockAnchor}
                      unlock={unlock}
                      onUnlocked={handleUnlocked}
                      onClose={() => setUnlockAnchor(undefined)}
                    >
                      {minusButton}
                    </UnlockPopover>
                  )}
                </div>
              </div>
              <div className="student-chips">
                {students.map(student => (
                  <button
                    type="button"
                    className={`student-chip ${selected.includes(student.id) ? "selected" : ""}`}
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                  >
                    <span>{student.name}</span>
                    <span className="coin">{student.balance} 榕币</span>
                  </button>
                ))}
              </div>
              {!students.length && (
                <div className="muted" style={{ padding: "8px 0" }}>
                  暂无启用学生
                </div>
              )}
            </section>
          );
        })}
        {ungroupedStudents.length > 0 && (
          <section className="group-block" key="__ungrouped__">
            <div className="group-header">
              <strong>
                未分组 <span className="muted">· {ungroupedStudents.length} 人</span>
              </strong>
            </div>
            <div className="student-chips">
              {ungroupedStudents.map(student => (
                <button
                  type="button"
                  className={`student-chip ${selected.includes(student.id) ? "selected" : ""}`}
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                >
                  <span>{student.name}</span>
                  <span className="coin">{student.balance} 榕币</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
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
              onSubmit={values => submitCredit(selected, 1, values)}
            >
              <Button
                type="primary"
                className="credit-pair-btn"
                disabled={!unlocked || !selected.length}
                icon={<Plus size={15} />}
                onClick={() => openCredit("footer-1", 1, selected)}
              >
                加分
              </Button>
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
              onSubmit={values => submitCredit(selected, -1, values)}
            >
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
                { key: "logout", label: "注销登录", icon: <LogOut size={15} />, onClick: logout },
              ],
            }}
          >
            <Button type="text" icon={<MoreHorizontal size={15} />}>
              更多
            </Button>
          </Dropdown>
        </div>
      </footer>
    </div>
  );
}
