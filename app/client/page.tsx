"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Spin } from "antd";
import { LayoutGrid, LockKeyhole, PawPrint, UnlockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, api, useMessage, useResource } from "@/lib/client";
import { derivePetStage } from "@/lib/pets";
import type { CreditTarget, PetThresholds, Student } from "@/lib/types";
import { CreditCelebration, type CreditCelebrationEvent } from "@/components/CreditCelebration";
import { GroupingDialog } from "@/components/GroupingDialog";
import { StatsDialog } from "@/components/StatsDialog";
import { PetDrawer } from "@/components/PetDrawer";
import { PetPickerDialog } from "@/components/PetPickerDialog";
import { type ChipEffect } from "@/components/StudentChip";
import { StudentChips } from "@/components/StudentChips";
import { GroupSection } from "@/components/GroupSection";
import { FooterBar } from "@/components/FooterBar";
import { LoadError } from "@/components/LoadError";

const CHIP_EFFECT_LIMIT = 30;
const FEEDBACK_DURATION = 1600;
// Keep the phase timings in sync with the content fade and group morph in globals.css.
const MODE_FADE_OUT_MS = 150;
const MODE_MORPH_MS = 280;
const MODE_EASING = "cubic-bezier(.22, 1, .36, 1)";
// useLayoutEffect only in the browser; the FLIP pass measures the DOM right after
// the mode commits, before the browser paints the new layout.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type FlipRects = { groups: Map<string, DOMRect>; tiles: Map<string, DOMRect> };

function captureFlipRects(): FlipRects {
  const groups = new Map<string, DOMRect>();
  const tiles = new Map<string, DOMRect>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-flip-group]")) {
    if (el.dataset.flipGroup) groups.set(el.dataset.flipGroup, el.getBoundingClientRect());
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-tile-id]")) {
    if (el.dataset.tileId) tiles.set(el.dataset.tileId, el.getBoundingClientRect());
  }
  return { groups, tiles };
}

type Reason = { id: string; name: string; parentId?: string | null };
type Bootstrap = {
  client: { code: string };
  class: { id: string; name: string };
  groups: { id: string; name: string; status: number }[];
  students: Student[];
  reasons: Reason[];
  petEnabled: boolean;
  petThresholds: PetThresholds | null;
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
  const [petMode, setPetMode] = useState(false);
  const [modePhase, setModePhase] = useState<"out" | "in">();
  const [petDrawerId, setPetDrawerId] = useState<string>();
  const [petPicker, setPetPicker] = useState<{ studentId: string; mode: "select" | "change" }>();
  const [petSaving, setPetSaving] = useState(false);
  const [evolvingPets, setEvolvingPets] = useState<Record<string, boolean>>({});
  const [petAnimations, setPetAnimations] = useState(() => !prefersReducedMotion());
  const [groupOverrides, setGroupOverrides] = useState<{
    source?: Bootstrap;
    values: Record<string, string | null>;
  }>({ values: {} });
  const celebrationSeq = useRef(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const modeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flipRects = useRef<FlipRects | undefined>(undefined);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [bootstrap, reload, , bootstrapError] = useResource(
    () => api<Bootstrap>("/api/client/bootstrap"),
    [],
    err => {
      notifyError(err, "加载失败");
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) router.replace("/");
    },
  );
  const [pending, setPending] = useState<{
    source?: Bootstrap;
    deltas: Record<string, number>;
    growths: Record<string, number>;
  }>({ deltas: {}, growths: {} });
  const data = useMemo(() => {
    if (!bootstrap) return undefined;
    const deltas = pending.source === bootstrap ? pending.deltas : {};
    const growths = pending.source === bootstrap ? pending.growths : {};
    const overrides = groupOverrides.source === bootstrap ? groupOverrides.values : {};
    if (!Object.keys(deltas).length && !Object.keys(growths).length && !Object.keys(overrides).length) return bootstrap;
    return {
      ...bootstrap,
      students: bootstrap.students.map(student => {
        const delta = deltas[student.id];
        const growthDelta = growths[student.id];
        const groupId = overrides[student.id];
        if (delta === undefined && growthDelta === undefined && groupId === undefined) return student;
        const growth = student.growth === undefined ? undefined : student.growth + (growthDelta ?? 0);
        const thresholds = bootstrap.petThresholds;
        const pet =
          student.pet && growth !== undefined && thresholds
            ? {
                ...student.pet,
                stage: Math.max(student.pet.stage, derivePetStage(growth, thresholds.stage2, thresholds.stage3)),
              }
            : student.pet;
        return {
          ...student,
          balance: student.balance + (delta ?? 0),
          groupId: groupId === undefined ? student.groupId : (groupId ?? null),
          growth,
          pet,
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
  useEffect(
    () => () => {
      clearTimeout(feedbackTimer.current);
      clearTimeout(modeTimer.current);
    },
    [],
  );
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
      const thresholds = bootstrap?.petThresholds;
      const evolving: Record<string, boolean> = {};
      if (direction > 0 && thresholds) {
        for (const id of ids) {
          const student = data?.students.find(item => item.id === id);
          if (!student?.pet || student.growth === undefined) continue;
          const nextStage = derivePetStage(student.growth + amount, thresholds.stage2, thresholds.stage3);
          if (nextStage > student.pet.stage) evolving[id] = true;
        }
      }
      setEvolvingPets(evolving);
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => {
        setCelebration(undefined);
        setChipEffects({});
        setEvolvingPets({});
      }, FEEDBACK_DURATION);
      setCreditTarget(undefined);
      setSelected([]);
      setPending(current => {
        const source = current.source === bootstrap;
        const deltas = { ...(source ? current.deltas : {}) };
        const growths = { ...(source ? current.growths : {}) };
        for (const id of ids) {
          deltas[id] = (deltas[id] || 0) + direction * amount;
          if (direction > 0) growths[id] = (growths[id] || 0) + amount;
        }
        return { source: bootstrap, deltas, growths };
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
  const petModeOn = petMode && Boolean(data?.petEnabled);
  // During the fade-out phase petMode has not committed yet, so the heading uses
  // the pending target mode to hide/show its action together with the list.
  const modeTarget = modePhase === "out" ? !petMode : petModeOn;
  // FLIP pass: right after the mode commits, shift group blocks back to their old
  // position and morph every tile frame from its previous rect into the new one.
  // The frames stay visible the whole time; only their geometry animates.
  useIsomorphicLayoutEffect(() => {
    if (modePhase !== "in") {
      // Phase over: drop any inline morph leftovers from the group blocks.
      for (const el of document.querySelectorAll<HTMLElement>("[data-flip-group]")) {
        el.style.transition = "";
        el.style.transform = "";
      }
      return;
    }
    const rects = flipRects.current;
    flipRects.current = undefined;
    if (!rects) return;
    const shifted: HTMLElement[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-flip-group]")) {
      const previous = el.dataset.flipGroup ? rects.groups.get(el.dataset.flipGroup) : undefined;
      if (!previous) continue;
      const dy = previous.top - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      shifted.push(el);
    }
    for (const el of document.querySelectorAll<HTMLElement>("[data-tile-id]")) {
      const previous = el.dataset.tileId ? rects.tiles.get(el.dataset.tileId) : undefined;
      if (!previous) continue;
      const current = el.getBoundingClientRect();
      if (!current.width || !current.height) continue;
      const dx = previous.left - current.left;
      const dy = previous.top - current.top;
      const sx = previous.width / current.width;
      const sy = previous.height / current.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) continue;
      el.style.transformOrigin = "0 0";
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: "translate(0px, 0px) scale(1, 1)" },
        ],
        { duration: MODE_MORPH_MS, easing: MODE_EASING },
      )
        .finished.catch(() => undefined)
        .finally(() => {
          el.style.transformOrigin = "";
        });
    }
    for (const el of shifted) {
      el.style.transition = `transform ${MODE_MORPH_MS}ms ${MODE_EASING}`;
      el.style.transform = "";
    }
  }, [modePhase]);
  const petDrawerStudent = data?.students.find(student => student.id === petDrawerId);
  // Same render-time reconciliation as the selection above: leaving pet mode
  // behind when the global switch turns the feature off.
  if (data && !data.petEnabled && petMode) {
    setPetMode(false);
    setPetDrawerId(undefined);
    setPetPicker(undefined);
  }
  // Pet mode animates every card at 4 fps; when the device cannot keep up for a
  // sustained period, fall back to static first frames for the rest of the session.
  useEffect(() => {
    if (!petModeOn || !petAnimations) return;
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();
    let slowAt: number | undefined;
    const tick = (now: number) => {
      frames++;
      if (now - windowStart >= 1000) {
        if (frames < 30) {
          if (slowAt === undefined) slowAt = now;
          if (now - slowAt >= 5000) {
            setPetAnimations(false);
            return;
          }
        } else {
          slowAt = undefined;
        }
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [petModeOn, petAnimations]);
  // Two-phase swap: fade only the tile contents out (frames and group headers stay
  // visible), swap the mode at the invisible midpoint, then FLIP the frames from the
  // old geometry into the new one and fade the new contents back in.
  function togglePetMode() {
    if (modePhase) return;
    setCreditTarget(undefined);
    setUnlockAnchor(undefined);
    const leaving = petMode;
    const commit = () => {
      setPetMode(!leaving);
      if (leaving) {
        setPetDrawerId(undefined);
        setPetPicker(undefined);
      }
    };
    if (prefersReducedMotion()) {
      commit();
      return;
    }
    setModePhase("out");
    modeTimer.current = setTimeout(() => {
      flipRects.current = captureFlipRects();
      commit();
      setModePhase("in");
      modeTimer.current = setTimeout(() => setModePhase(undefined), MODE_MORPH_MS);
    }, MODE_FADE_OUT_MS);
  }
  async function confirmPet(species: string) {
    if (!petPicker) return;
    setPetSaving(true);
    try {
      await api("/api/client/pets", {
        method: "POST",
        body: JSON.stringify({ studentId: petPicker.studentId, species }),
      });
      message.success(petPicker.mode === "change" ? "宠物已更换" : "宠物已选择");
      setPetPicker(undefined);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        message.warning(err.message);
        setPetPicker(undefined);
        reload();
        return;
      }
      notifyError(err, "操作失败");
    } finally {
      setPetSaving(false);
    }
  }
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
            <p key={petModeOn ? "pet" : "credit"} className="mode-hint">
              {petModeOn ? "点击学生卡片可查看宠物详情与更换宠物。" : "选中学生气泡后可在底部栏进行积分操作。"}
            </p>
          </div>
          <div className="heading-actions">
            {data.petEnabled && (
              <Button type="primary" icon={<PawPrint size={15} />} onClick={togglePetMode}>
                {petModeOn ? "返回积分模式" : "宠物模式"}
              </Button>
            )}
            {!modeTarget && (
              <Button icon={<LayoutGrid size={15} />} onClick={() => setGroupingOpen(true)}>
                调整分组
              </Button>
            )}
          </div>
        </div>
        <div className={`mode-stage ${modePhase ? "mode-content-hidden" : ""}`}>
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
              petMode={petModeOn}
              actionsHidden={modeTarget}
              onOpenPet={setPetDrawerId}
              petAnimations={petAnimations}
              evolvingPets={evolvingPets}
            />
          ))}
          {ungroupedStudents.length > 0 && (
            <section className="group-block" data-flip-group="ungrouped">
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
                petMode={petModeOn}
                onOpenPet={setPetDrawerId}
                petAnimations={petAnimations}
                evolvingPets={evolvingPets}
              />
            </section>
          )}
        </div>
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
        petMode={petModeOn}
      />
      <GroupingDialog
        open={groupingOpen}
        groups={activeGroups}
        students={activeStudents.map(student => ({ id: student.id, name: student.name, groupId: student.groupId }))}
        onClose={() => setGroupingOpen(false)}
        onMove={moveStudent}
      />
      <StatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} />
      <PetDrawer
        student={petDrawerStudent}
        thresholds={data.petThresholds}
        onOpenPicker={() =>
          petDrawerStudent &&
          setPetPicker({ studentId: petDrawerStudent.id, mode: petDrawerStudent.pet ? "change" : "select" })
        }
        onClose={() => setPetDrawerId(undefined)}
      />
      <PetPickerDialog
        open={Boolean(petPicker)}
        title={petPicker?.mode === "change" ? "更换宠物" : "选择宠物"}
        currentSpecies={
          petPicker ? data.students.find(student => student.id === petPicker.studentId)?.pet?.species : undefined
        }
        confirmLoading={petSaving}
        onConfirm={confirmPet}
        onCancel={() => setPetPicker(undefined)}
      />
      <CreditCelebration event={celebration} />
    </div>
  );
}
