export type Tool = "pen" | "eraser" | "line";

export type Panel = Tool | "background" | "transparency";

export type Background = "black" | "white" | "blackGrid" | "whiteGrid";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  tool: "pen" | "line";
  color: string;
  width: number;
  points: Point[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BoardState {
  version: number;
  height: number;
  background: Background;
  transparency: number;
  strokes: Stroke[];
}

export type Command =
  | { type: "add"; index: number; stroke: Stroke }
  | { type: "erase"; index: number; stroke: Stroke }
  | {
      type: "clear";
      snapshot: { background: Background; transparency: number; strokes: Stroke[] };
    }
  | { type: "background"; from: Background; to: Background }
  | { type: "transparency"; from: number; to: number };

export const MAX_HISTORY = 200;

export const BOARD_VERSION = 1;

export const DEFAULT_BACKGROUND: Background = "black";

export const DEFAULT_TRANSPARENCY = 0;

export const PEN_COLORS = [
  "#1a1a1a",
  "#808080",
  "#ffffff",
  "#e53935",
  "#fb8c00",
  "#fdd835",
  "#43a047",
  "#1e88e5",
  "#8e24aa",
];

export function createStroke(tool: "pen" | "line", color: string, width: number, points: Point[]): Stroke {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { tool, color, width, points, minX, minY, maxX, maxY };
}

export function applyCommand(state: BoardState, command: Command, forward: boolean): BoardState {
  switch (command.type) {
    case "add":
      return forward ? insertStroke(state, command.index, command.stroke) : removeStroke(state, command.index);
    case "erase":
      return forward ? removeStroke(state, command.index) : insertStroke(state, command.index, command.stroke);
    case "clear":
      return forward
        ? {
            ...state,
            background: DEFAULT_BACKGROUND,
            transparency: DEFAULT_TRANSPARENCY,
            strokes: [],
          }
        : {
            ...state,
            background: command.snapshot.background,
            transparency: command.snapshot.transparency,
            strokes: command.snapshot.strokes,
          };
    case "background":
      return { ...state, background: forward ? command.to : command.from };
    case "transparency":
      return { ...state, transparency: forward ? command.to : command.from };
  }
}

export function parseBoard(text: string): BoardState | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== BOARD_VERSION) {
    return null;
  }
  if (typeof record.height !== "number" || !Number.isFinite(record.height) || record.height <= 0) {
    return null;
  }
  if (!isBackground(record.background)) {
    return null;
  }
  if (typeof record.transparency !== "number" || !Number.isFinite(record.transparency)) {
    return null;
  }
  if (!Array.isArray(record.strokes)) {
    return null;
  }
  const strokes: Stroke[] = [];
  for (const item of record.strokes) {
    const stroke = parseStroke(item);
    if (!stroke) {
      return null;
    }
    strokes.push(stroke);
  }
  return {
    version: BOARD_VERSION,
    height: record.height,
    background: record.background,
    transparency: Math.min(Math.max(record.transparency, 0), 90),
    strokes,
  };
}

function isBackground(value: unknown): value is Background {
  return value === "black" || value === "white" || value === "blackGrid" || value === "whiteGrid";
}

function parseStroke(value: unknown): Stroke | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.tool !== "pen" && record.tool !== "line") {
    return null;
  }
  if (typeof record.color !== "string") {
    return null;
  }
  if (typeof record.width !== "number" || !Number.isFinite(record.width)) {
    return null;
  }
  if (!Array.isArray(record.points)) {
    return null;
  }
  const points: Point[] = [];
  for (const item of record.points) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const point = item as Record<string, unknown>;
    if (typeof point.x !== "number" || !Number.isFinite(point.x)) {
      return null;
    }
    if (typeof point.y !== "number" || !Number.isFinite(point.y)) {
      return null;
    }
    points.push({ x: point.x, y: point.y });
  }
  return createStroke(record.tool, record.color, record.width, points);
}

export function distanceToStroke(stroke: Stroke, x: number, y: number): number {
  const points = stroke.points;
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (points.length === 1) {
    return Math.hypot(x - points[0].x, y - points[0].y);
  }
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(x, y, points[index - 1], points[index]));
  }
  return best;
}

function insertStroke(state: BoardState, index: number, stroke: Stroke): BoardState {
  const strokes = state.strokes.slice();
  strokes.splice(Math.min(index, strokes.length), 0, stroke);
  return { ...state, strokes };
}

function removeStroke(state: BoardState, index: number): BoardState {
  const strokes = state.strokes.slice();
  strokes.splice(index, 1);
  return { ...state, strokes };
}

function distanceToSegment(x: number, y: number, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(x - from.x, y - from.y);
  }
  const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared));
  return Math.hypot(x - (from.x + t * dx), y - (from.y + t * dy));
}
