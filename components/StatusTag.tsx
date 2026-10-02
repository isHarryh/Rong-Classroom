import { Tag } from "antd";

export function StatusTag({ value, disabledLabel = "禁用" }: { value: number; disabledLabel?: string }) {
  return (
    <Tag color={value === 1 ? "green" : value === 0 ? "orange" : "default"}>
      {value === 1 ? "启用" : value === 0 ? disabledLabel : "已删除"}
    </Tag>
  );
}
