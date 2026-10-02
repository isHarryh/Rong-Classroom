import { useCallback, useEffect, useState } from "react";
import { App } from "antd";

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
  return err instanceof Error ? err.message : fallback;
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
  const [settled, setSettled] = useState<{ version: number; data?: T }>({ version: -1 });
  const reload = useCallback(() => setVersion(current => current + 1), []);
  useEffect(() => {
    let ignore = false;
    load().then(
      value => {
        if (!ignore) setSettled({ version, data: value });
      },
      err => {
        if (ignore) return;
        setSettled({ version });
        if (onError) onError(err);
        else message.error(errorText(err, "加载失败"));
      },
    );
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  const loading = settled.version !== version;
  return [loading ? undefined : settled.data, reload, loading] as const;
}

export function formatTime(timestamp?: number | null) {
  if (!timestamp) return "暂无";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}
