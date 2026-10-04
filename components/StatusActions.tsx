"use client";

import { Button, Popconfirm, Switch } from "antd";
import { RotateCcw, Trash2 } from "lucide-react";

type StatusActionsProps = {
  status: number;
  onToggle: () => void;
  onDelete?: () => void;
  // Popconfirm text for toggling, either static or depending on the current status.
  toggleConfirm?: string | ((status: number) => string);
  deleteConfirm?: string;
  disableLabel?: string;
  enableLabel?: string;
};

export function StatusActions({
  status,
  onToggle,
  onDelete,
  toggleConfirm,
  deleteConfirm,
  disableLabel = "禁用",
  enableLabel = "启用",
}: StatusActionsProps) {
  if (status === 2) return <Button type="text" icon={<RotateCcw size={15} />} title="恢复" onClick={onToggle} />;
  const toggle = (
    <Button type="text" onClick={onToggle}>
      {status === 1 ? disableLabel : enableLabel}
    </Button>
  );
  return (
    <div className="inline-actions">
      {toggleConfirm ? (
        <Popconfirm
          title={typeof toggleConfirm === "function" ? toggleConfirm(status) : toggleConfirm}
          onConfirm={onToggle}
        >
          {toggle}
        </Popconfirm>
      ) : (
        toggle
      )}
      {onDelete && (
        <Popconfirm title={deleteConfirm} onConfirm={onDelete}>
          <Button danger type="text" icon={<Trash2 size={15} />} />
        </Popconfirm>
      )}
    </div>
  );
}

export function DeletedToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="data-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
      <Switch checked={checked} onChange={onChange} />
      <span className="muted">{label}</span>
    </div>
  );
}
