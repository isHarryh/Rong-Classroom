import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import { createStroke, type Point, type Tool } from "./model";
import { drawPendingStroke, drawSegment, drawStroke } from "./render";
import type { BoardDocument } from "./useBoardDocument";

const MIN_LINE_LENGTH = 3;

interface Viewport {
  width: number;
  height: number;
}

interface FreeDraw {
  kind: "free";
  points: Point[];
}

interface LineDraw {
  kind: "line";
  start: Point;
  current: Point;
}

type ActiveDraw = FreeDraw | LineDraw | { kind: "erase" } | null;

interface BoardCanvasOptions {
  surfaceRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  boardDocument: BoardDocument;
  tool: Tool;
  color: string;
  strokeWidth: number;
  enabled: boolean;
}

export function useBoardCanvas(options: BoardCanvasOptions) {
  const { surfaceRef, canvasRef, boardDocument, tool, color, strokeWidth, enabled } = options;
  const { board, boardRef, ensureHeight, commitStroke, eraseAt, growIfNeeded } = boardDocument;

  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [scrollY, setScrollY] = useState(0);
  const viewportRef = useRef(viewport);
  const scrollRef = useRef(scrollY);
  const dprRef = useRef(1);
  const drawRef = useRef<ActiveDraw>(null);
  const panRef = useRef<{ pointerY: number; scrollY: number } | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());

  const setScroll = useCallback(
    (value: number) => {
      const max = Math.max(0, boardRef.current.height - viewportRef.current.height);
      const next = Math.min(Math.max(value, 0), max);
      scrollRef.current = next;
      setScrollY(next);
    },
    [boardRef],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const dpr = dprRef.current;
    const offset = scrollRef.current;
    const viewportHeight = viewportRef.current.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, -offset * dpr);
    for (const stroke of boardRef.current.strokes) {
      drawStroke(context, stroke, offset, viewportHeight);
    }
    const active = drawRef.current;
    if (active?.kind === "line") {
      drawPendingStroke(context, "line", color, strokeWidth, [active.start, active.current], offset, viewportHeight);
    } else if (active?.kind === "free") {
      drawPendingStroke(context, "pen", color, strokeWidth, active.points, offset, viewportHeight);
    }
  }, [boardRef, canvasRef, color, strokeWidth]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    const update = () => {
      const rect = surface.getBoundingClientRect();
      dprRef.current = window.devicePixelRatio || 1;
      const next = { width: rect.width, height: rect.height };
      viewportRef.current = next;
      setViewport(next);
      ensureHeight(rect.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [surfaceRef, ensureHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width === 0) {
      return;
    }
    const dpr = dprRef.current;
    const pixelWidth = Math.round(viewport.width * dpr);
    const pixelHeight = Math.round(viewport.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    redraw();
  }, [board, canvasRef, redraw, scrollY, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScroll(scrollRef.current + event.deltaY);
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [canvasRef, setScroll]);

  const toBoardPoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { x: 0, y: 0 };
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top + scrollRef.current,
      };
    },
    [canvasRef],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !enabled) {
        return;
      }
      canvas.setPointerCapture(event.pointerId);

      if (event.pointerType === "touch") {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPointsRef.current.size === 2) {
          drawRef.current = null;
          const points = [...touchPointsRef.current.values()];
          panRef.current = {
            pointerY: (points[0].y + points[1].y) / 2,
            scrollY: scrollRef.current,
          };
          redraw();
          return;
        }
        if (touchPointsRef.current.size > 2) {
          return;
        }
      }

      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }

      const point = toBoardPoint(event);
      if (tool === "pen") {
        drawRef.current = { kind: "free", points: [point] };
      } else if (tool === "line") {
        drawRef.current = { kind: "line", start: point, current: point };
        redraw();
      } else {
        drawRef.current = { kind: "erase" };
        eraseAt(point, strokeWidth);
      }
    },
    [canvasRef, enabled, eraseAt, redraw, strokeWidth, toBoardPoint, tool],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!enabled) {
        return;
      }
      if (event.pointerType === "touch" && touchPointsRef.current.has(event.pointerId)) {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (panRef.current && touchPointsRef.current.size >= 2) {
          const points = [...touchPointsRef.current.values()];
          const midpoint = (points[0].y + points[1].y) / 2;
          setScroll(panRef.current.scrollY + (panRef.current.pointerY - midpoint));
          return;
        }
      }

      const active = drawRef.current;
      if (!active) {
        return;
      }
      const point = toBoardPoint(event);
      if (active.kind === "free") {
        const previous = active.points[active.points.length - 1];
        active.points.push(point);
        const context = canvasRef.current?.getContext("2d");
        if (context) {
          const dpr = dprRef.current;
          context.setTransform(dpr, 0, 0, dpr, 0, -scrollRef.current * dpr);
          drawSegment(context, previous, point, color, strokeWidth);
        }
        growIfNeeded(point.y, viewportRef.current.height);
      } else if (active.kind === "line") {
        active.current = point;
        redraw();
      } else {
        eraseAt(point, strokeWidth);
      }
    },
    [canvasRef, color, enabled, eraseAt, growIfNeeded, redraw, setScroll, strokeWidth, toBoardPoint],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!enabled) {
        return;
      }
      const canvas = canvasRef.current;
      if (canvas?.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      if (event.pointerType === "touch") {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) {
          panRef.current = null;
        }
      }

      const active = drawRef.current;
      if (!active) {
        return;
      }
      drawRef.current = null;

      if (active.kind === "free") {
        const points =
          active.points.length === 1
            ? [active.points[0], { x: active.points[0].x + 0.01, y: active.points[0].y + 0.01 }]
            : active.points;
        commitStroke(createStroke("pen", color, strokeWidth, points));
      } else if (active.kind === "line") {
        const length = Math.hypot(active.current.x - active.start.x, active.current.y - active.start.y);
        if (length >= MIN_LINE_LENGTH) {
          growIfNeeded(Math.max(active.start.y, active.current.y), viewportRef.current.height);
          commitStroke(createStroke("line", color, strokeWidth, [active.start, active.current]));
        } else {
          redraw();
        }
      }
    },
    [canvasRef, color, commitStroke, enabled, growIfNeeded, redraw, strokeWidth],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!enabled) {
        return;
      }
      const canvas = canvasRef.current;
      if (canvas?.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      if (event.pointerType === "touch") {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) {
          panRef.current = null;
        }
      }
      if (drawRef.current) {
        drawRef.current = null;
        redraw();
      }
    },
    [canvasRef, enabled, redraw],
  );

  return {
    viewport,
    scrollY,
    setScroll,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
