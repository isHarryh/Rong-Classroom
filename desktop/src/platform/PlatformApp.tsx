import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { Blackboard } from "../blackboard/Blackboard";
import { closePlatform, getSettings, retryRemote, setMode, setRemoteBounds } from "../shared/ipc";
import type { Mode, RemoteStatus } from "../shared/types";

export function PlatformApp() {
  const [mode, setModeState] = useState<Mode>("web");
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>("absent");
  const [serverOrigin, setServerOrigin] = useState("");
  const centerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getSettings()
      .then(settings => {
        setModeState(settings.mode);
        setRemoteStatus(settings.remoteStatus);
        setServerOrigin(settings.serverOrigin);
      })
      .catch(() => {});

    const unlisten = listen<{ status: RemoteStatus }>("remote-status", event => {
      setRemoteStatus(event.payload.status);
    });
    return () => {
      void unlisten.then(dispose => dispose());
    };
  }, []);

  useEffect(() => {
    const center = centerRef.current;
    if (!center) {
      return;
    }
    const report = () => {
      const rect = center.getBoundingClientRect();
      void setRemoteBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(center);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, []);

  const switchMode = useCallback(async () => {
    const next: Mode = mode === "web" ? "blackboard" : "web";
    setModeState(next);
    await setMode(next);
  }, [mode]);

  const requestClose = useCallback(() => {
    void closePlatform();
  }, []);

  const loading = mode === "web" && (remoteStatus === "loading" || remoteStatus === "absent");
  const failed = mode === "web" && remoteStatus === "failed";

  return (
    <div className="platform">
      <div className="edge edge-top" onClick={requestClose}>
        点击此区域关闭
      </div>
      <div className="edge edge-bottom" onClick={requestClose}>
        点击此区域关闭
      </div>
      <div className="edge edge-left" onClick={requestClose}>
        点击此区域关闭
      </div>
      <div className="edge edge-right" onClick={requestClose}>
        点击此区域关闭
      </div>

      <div className="platform-center" ref={centerRef}>
        <div className="platform-blackboard" style={{ display: mode === "blackboard" ? "block" : "none" }}>
          <Blackboard />
        </div>
        {loading && <div className="platform-placeholder">正在连接服务器…</div>}
        {failed && (
          <div className="platform-placeholder platform-error">
            <p>无法连接到服务器</p>
            <p className="platform-error-address">{serverOrigin}</p>
            <button
              type="button"
              onClick={() => {
                void retryRemote();
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>

      <button type="button" className="mode-button mode-left" onClick={() => void switchMode()}>
        {mode === "web" ? "黑板" : "班级"}
      </button>
      <button type="button" className="mode-button mode-right" onClick={() => void switchMode()}>
        {mode === "web" ? "黑板" : "班级"}
      </button>
    </div>
  );
}
