"use client";

import { useState } from "react";
import { Modal } from "antd";
import { PetSprite } from "@/components/PetSprite";
import { PET_SPECIES } from "@/lib/pets";

// Species picker shared by the classroom drawer and the admin student list.
// Shows every species at stage 1; the caller handles quota rules.
export function PetPickerDialog({
  open,
  title = "选择宠物",
  currentSpecies,
  confirmLoading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  currentSpecies?: string;
  confirmLoading?: boolean;
  onConfirm: (species: string) => void;
  onCancel: () => void;
}) {
  const [selection, setSelection] = useState<{ open: boolean; species?: string }>({ open: false });
  // Reset the highlighted species during render whenever the dialog opens.
  if (selection.open !== open) setSelection({ open, species: open ? currentSpecies : selection.species });
  const selected = selection.open ? selection.species : undefined;
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => selected && onConfirm(selected)}
      okText="确认"
      cancelText="取消"
      okButtonProps={{ disabled: !selected || selected === currentSpecies }}
      confirmLoading={confirmLoading}
      width={660}
    >
      <div className="pet-picker-grid">
        {PET_SPECIES.map(species => (
          <button
            key={species.id}
            type="button"
            className={`pet-picker-item ${selected === species.id ? "selected" : ""}`}
            onClick={() => setSelection(current => ({ ...current, species: species.id }))}
          >
            <PetSprite species={species.id} stage={1} size={64} animate={false} />
            <span>{species.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
