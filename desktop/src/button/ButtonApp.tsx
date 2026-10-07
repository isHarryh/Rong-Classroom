import { useCallback, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { openPlatform, showButtonMenu } from "../shared/ipc";

const DRAG_THRESHOLD = 4;

export function ButtonApp() {
  const [idle, setIdle] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragStart.current = { x: event.screenX, y: event.screenY };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start || dragged.current) {
      return;
    }
    const distance = Math.abs(event.screenX - start.x) + Math.abs(event.screenY - start.y);
    if (distance > DRAG_THRESHOLD) {
      dragged.current = true;
      void getCurrentWindow().startDragging();
    }
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (start && !dragged.current) {
      void openPlatform();
    }
  }, []);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    void showButtonMenu();
  }, []);

  return (
    <div
      className={idle ? "floating-button idle" : "floating-button"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIdle(false)}
      onMouseLeave={() => setIdle(true)}
      title="打开榕课堂"
    >
      <svg className="floating-button-mark" viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M24 28.8 C 23.8 25 23.6 20.7 23.4 15.5"
          fill="none"
          stroke="#f2c94c"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M23.4 15.7 C 24.4 11.9 27.4 9.5 31.5 8.9 C 30.4 12.7 27.6 15.1 23.4 15.7 Z" fill="#f2c94c" />
        <path d="M23.7 19.6 C 23.3 16.2 20.8 14 15.6 13.4 C 16.1 17 19.1 19.2 23.7 19.6 Z" fill="#f2c94c" />
        <path d="M24 39.1 C 19.7 37.5 15.2 36.9 11.8 37.5 L11.8 26.6 C 15.2 26.1 19.7 26.6 24 28.2 Z" fill="#f3efe2" />
        <path d="M24 39.1 C 28.3 37.5 32.8 36.9 36.2 37.5 L36.2 26.6 C 32.8 26.1 28.3 26.6 24 28.2 Z" fill="#dde5d8" />
        <path d="M24 28.2 L24 39.1" stroke="#b7c3b2" strokeWidth="1.1" />
      </svg>
    </div>
  );
}
