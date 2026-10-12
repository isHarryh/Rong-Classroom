"use client";

import { Button, Drawer, Progress } from "antd";
import { ArrowLeftRight, Lock, PawPrint } from "lucide-react";
import { PetSprite } from "@/components/PetSprite";
import { PetStageTag } from "@/components/PetStageTag";
import { DEFAULT_PET_STAGE2_AT, DEFAULT_PET_STAGE3_AT, petSpeciesName, petStageThreshold } from "@/lib/pets";
import type { PetThresholds, Student } from "@/lib/types";

// Pet view for one student: growth progress, stage previews with locks and the
// pick/change entry. Picking and changing never needs the classroom unlock; only
// the per-student daily change limit applies.
export function PetDrawer({
  student,
  thresholds,
  onOpenPicker,
  onClose,
}: {
  student?: Student;
  thresholds?: PetThresholds | null;
  onOpenPicker: () => void;
  onClose: () => void;
}) {
  const pet = student?.pet;
  const growth = student?.growth ?? 0;
  const stage2 = thresholds?.stage2 ?? DEFAULT_PET_STAGE2_AT;
  const stage3 = thresholds?.stage3 ?? DEFAULT_PET_STAGE3_AT;
  const stage = pet?.stage ?? 1;
  const floor = petStageThreshold(stage, stage2, stage3);
  const ceil = stage === 1 ? stage2 : stage === 2 ? stage3 : undefined;
  const percent = ceil === undefined ? 100 : Math.min(100, Math.round(((growth - floor) / (ceil - floor)) * 100));
  const canChange = !pet || student?.canChangeToday !== false;
  const actionLabel = pet ? (canChange ? "更换宠物" : "今日已更换，明天可再更换") : "选择宠物";
  return (
    <Drawer title={student ? `${student.name} 的宠物` : "宠物"} width={420} open={Boolean(student)} onClose={onClose}>
      {student && (
        <div className="pet-drawer">
          <div className="pet-drawer-hero">
            {pet ? (
              <PetSprite species={pet.species} stage={stage} size={128} />
            ) : (
              <span className="pet-drawer-empty">
                <PawPrint size={48} />
              </span>
            )}
            <strong>{pet ? petSpeciesName(pet.species) : "还没有选择宠物"}</strong>
            {pet ? <PetStageTag stage={stage} roman /> : <span className="muted">选择一只宠物开始养成</span>}
          </div>
          <div className="pet-drawer-progress">
            <div className="pet-drawer-progress-head">
              <span>累计加分 {growth}</span>
              <span className="muted">
                {ceil === undefined ? "已达最高阶段" : `距阶段 ${stage + 1} 还差 ${Math.max(0, ceil - growth)} 分`}
              </span>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor="#176b5d" />
          </div>
          {pet && (
            <div className="pet-drawer-stages">
              {[1, 2, 3].map(stageNumber => {
                const threshold = petStageThreshold(stageNumber, stage2, stage3);
                // Lock previews against the high-water stage so raising the
                // thresholds later never shows an owned stage as locked.
                const locked = stageNumber > stage;
                return (
                  <div key={stageNumber} className={`pet-stage-preview ${locked ? "locked" : ""}`}>
                    <span className="pet-stage-preview-sprite">
                      <PetSprite species={pet.species} stage={stageNumber} size={64} animate={false} />
                      {locked && (
                        <span className="pet-stage-lock">
                          <Lock size={16} />
                        </span>
                      )}
                    </span>
                    <span className="pet-stage-preview-label">
                      {locked ? `累计加分 ${threshold} 解锁` : <PetStageTag stage={stageNumber} roman />}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="pet-drawer-actions">
            <Button
              type="primary"
              block
              disabled={!canChange}
              icon={pet ? <ArrowLeftRight size={15} /> : undefined}
              onClick={onOpenPicker}
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
