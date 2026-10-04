"use client";

import { Alert, Button } from "antd";

export function LoadError({ title = "加载失败", onRetry }: { title?: string; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title={title}
      description={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
      style={{ maxWidth: 420 }}
    />
  );
}
