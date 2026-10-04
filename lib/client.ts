import { useCallback, useEffect, useState } from "react";
import { App, Form } from "antd";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError((data as { message?: string } | null)?.message || "请求失败", response.status);
  return data as T;
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export function useMessage() {
  const { message } = App.useApp();
  const notifyError = useCallback(
    (err: unknown, fallback = "操作失败") => message.error(errorText(err, fallback)),
    [message],
  );
  return { message, notifyError };
}

export function useResource<T>(load: () => Promise<T>, deps: unknown[], onError?: (err: unknown) => void) {
  const { message } = App.useApp();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ version: number; data?: T; error?: unknown }>({ version: -1 });
  const reload = useCallback(() => setVersion(current => current + 1), []);
  useEffect(() => {
    let ignore = false;
    load().then(
      value => {
        if (!ignore) setState({ version, data: value });
      },
      err => {
        if (ignore) return;
        setState(current => ({ version, data: current.data, error: err }));
        if (onError) onError(err);
        else message.error(errorText(err, "加载失败"));
      },
    );
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return [state.data, reload, state.version !== version, state.version === version ? state.error : undefined] as const;
}

export function formatTime(timestamp?: number | null) {
  if (!timestamp) return "暂无";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function formatTerm(termYear: number, termNum: number) {
  return `${termYear}-${termYear + 1} 学年第 ${termNum} 学期`;
}

export function reasonLabel(reason: { name: string; parentId?: string | null }) {
  return reason.parentId ? `　${reason.name}` : reason.name;
}

// Shrinks the "selected names" summary to the line width, measuring with canvas.
export function fitSummary(names: string[], el: HTMLDivElement | null, width: number) {
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

// Shared state machine for "list CRUD modals": open (create or edit), form
// management, and close-with-reset so reopening never shows stale field values.
// record is stored as context and pre-fills the form; values (when given)
// overrides specific fields afterwards (e.g. blanking a password input).
export function useEditModal<T extends object>() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T>();
  const [form] = Form.useForm();
  const openModal = useCallback(
    (record?: T, values?: Record<string, unknown>) => {
      setEditing(record);
      form.resetFields();
      if (record) form.setFieldsValue(record as Record<string, unknown>);
      if (values) form.setFieldsValue(values);
      setOpen(true);
    },
    [form],
  );
  const closeModal = useCallback(() => setOpen(false), []);
  return { open, editing, form, openModal, closeModal };
}
