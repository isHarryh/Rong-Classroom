import type { CSSProperties } from "react";

import { createStroke, type Background, type BoardState, type Point, type Stroke } from "./model";

const GRID_SIZE = 40;
const MAX_PNG_DIMENSION = 16384;
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 400;

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  offset: number,
  viewportHeight: number,
): void {
  if (stroke.maxY < offset - 20 || stroke.minY > offset + viewportHeight + 20) {
    return;
  }
  const points = stroke.points;
  if (points.length === 0) {
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

export function drawPendingStroke(
  context: CanvasRenderingContext2D,
  tool: "pen" | "line",
  color: string,
  width: number,
  points: Point[],
  offset: number,
  viewportHeight: number,
): void {
  drawStroke(context, createStroke(tool, color, width, points), offset, viewportHeight);
}

export function drawSegment(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  lineWidth: number,
): void {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

export function backgroundStyleFor(background: Background, offset: number, transparency: number): CSSProperties {
  const white = background === "white" || background === "whiteGrid";
  const grid = background === "blackGrid" || background === "whiteGrid";
  return {
    backgroundColor: white ? "#ffffff" : "#000000",
    backgroundImage: grid
      ? "linear-gradient(to right, rgba(128, 128, 128, 0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(128, 128, 128, 0.4) 1px, transparent 1px)"
      : "none",
    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
    backgroundPosition: `0 ${-offset}px`,
    opacity: 1 - transparency / 100,
  };
}

export function renderBoardPng(board: BoardState, width: number): Promise<Blob> {
  const logicalWidth = Math.max(1, width);
  const logicalHeight = Math.max(1, board.height);
  const scale = Math.min(window.devicePixelRatio || 1, MAX_PNG_DIMENSION / logicalHeight);
  return renderBoard(board, logicalWidth, logicalHeight, scale, 1 - board.transparency / 100);
}

export function renderBoardThumbnail(board: BoardState, width: number): Promise<Blob> {
  const logicalWidth = Math.max(1, width);
  const logicalHeight = Math.max(1, board.height);
  const scale = Math.min(THUMBNAIL_WIDTH / logicalWidth, THUMBNAIL_HEIGHT / logicalHeight, 1);
  return renderBoard(board, logicalWidth, logicalHeight, scale, 1);
}

function renderBoard(
  board: BoardState,
  logicalWidth: number,
  logicalHeight: number,
  scale: number,
  opacity: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(logicalWidth * scale));
  canvas.height = Math.max(1, Math.round(logicalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("canvas unavailable"));
  }
  const white = board.background === "white" || board.background === "whiteGrid";
  const grid = board.background === "blackGrid" || board.background === "whiteGrid";
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.globalAlpha = opacity;
  context.fillStyle = white ? "#ffffff" : "#000000";
  context.fillRect(0, 0, logicalWidth, logicalHeight);
  if (grid) {
    context.strokeStyle = "rgba(128, 128, 128, 0.4)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= logicalWidth; x += GRID_SIZE) {
      context.moveTo(x, 0);
      context.lineTo(x, logicalHeight);
    }
    for (let y = 0; y <= logicalHeight; y += GRID_SIZE) {
      context.moveTo(0, y);
      context.lineTo(logicalWidth, y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
  for (const stroke of board.strokes) {
    drawStroke(context, stroke, 0, logicalHeight);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("failed to encode png"));
      }
    }, "image/png");
  });
}
