"use client";

import { Button, Modal, Table } from "antd";
import { Download, PawPrint } from "lucide-react";
import { PetStageTag } from "@/components/PetStageTag";
import { petSpeciesName } from "@/lib/pets";
import type { PetInfo } from "@/lib/types";
import { exportExcel, recordColumns, toSheetRows, type RecordItem } from "./record-helpers";

export type StudentDetail = {
  student: { id: string; name: string; pet?: PetInfo | null; growth?: number };
  records: RecordItem[];
};

export function StudentDetailModal({
  detail,
  petEnabled,
  onPetChange,
  onClose,
}: {
  detail?: StudentDetail;
  petEnabled?: boolean;
  onPetChange?: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`${detail?.student.name || ""} 的积分明细`}
      open={Boolean(detail)}
      onCancel={onClose}
      footer={
        <>
          <Button
            icon={<Download size={15} />}
            onClick={() =>
              detail &&
              exportExcel(toSheetRows(detail.records, false), `${detail.student.name}-积分明细.xlsx`, "个人明细")
            }
          >
            导出个人明细
          </Button>
          {petEnabled && onPetChange && (
            <Button icon={<PawPrint size={15} />} onClick={onPetChange}>
              更换宠物
            </Button>
          )}
        </>
      }
      width={800}
    >
      {detail && (
        <p>
          宠物：
          {detail.student.pet ? (
            <>
              {petSpeciesName(detail.student.pet.species)} <PetStageTag stage={detail.student.pet.stage} />
            </>
          ) : (
            "未选择"
          )}
          {detail.student.growth !== undefined && <span className="muted">（累计加分 {detail.student.growth}）</span>}
        </p>
      )}
      <Table
        rowKey="id"
        dataSource={detail?.records || []}
        pagination={{ pageSize: 10 }}
        columns={recordColumns(false)}
      />
    </Modal>
  );
}
