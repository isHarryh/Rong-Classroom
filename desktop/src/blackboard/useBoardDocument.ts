import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  applyCommand,
  BOARD_VERSION,
  DEFAULT_BACKGROUND,
  DEFAULT_TRANSPARENCY,
  distanceToStroke,
  MAX_HISTORY,
  type Background,
  type BoardState,
  type Command,
  type Point,
  type Stroke,
} from "./model";

const ERASE_TOLERANCE = 4;

export interface BoardDocument {
  board: BoardState;
  boardRef: RefObject<BoardState>;
  history: { undo: number; redo: number };
  ensureHeight: (minHeight: number) => void;
  commitStroke: (stroke: Stroke) => void;
  eraseAt: (point: Point, width: number) => void;
  growIfNeeded: (y: number, viewportHeight: number) => void;
  changeBackground: (background: Background) => void;
  previewTransparency: (value: number) => void;
  commitTransparency: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  replace: (board: BoardState) => void;
}

export function useBoardDocument(): BoardDocument {
  const [board, setBoard] = useState<BoardState>(() => ({
    version: BOARD_VERSION,
    height: 0,
    background: DEFAULT_BACKGROUND,
    transparency: DEFAULT_TRANSPARENCY,
    strokes: [],
  }));
  const boardRef = useRef(board);
  const undoRef = useRef<Command[]>([]);
  const redoRef = useRef<Command[]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const transparencyStartRef = useRef<number | null>(null);

  const commit = useCallback((next: BoardState) => {
    boardRef.current = next;
    setBoard(next);
  }, []);

  const pushHistory = useCallback((command: Command) => {
    undoRef.current.push(command);
    if (undoRef.current.length > MAX_HISTORY) {
      undoRef.current.shift();
    }
    redoRef.current = [];
    setHistory({ undo: undoRef.current.length, redo: 0 });
  }, []);

  const apply = useCallback(
    (command: Command) => {
      commit(applyCommand(boardRef.current, command, true));
      pushHistory(command);
    },
    [commit, pushHistory],
  );

  const ensureHeight = useCallback(
    (minHeight: number) => {
      if (boardRef.current.height < minHeight) {
        commit({ ...boardRef.current, height: minHeight });
      }
    },
    [commit],
  );

  const commitStroke = useCallback(
    (stroke: Stroke) => {
      apply({ type: "add", index: boardRef.current.strokes.length, stroke });
    },
    [apply],
  );

  const eraseAt = useCallback(
    (point: Point, width: number) => {
      const strokes = boardRef.current.strokes;
      for (let index = strokes.length - 1; index >= 0; index -= 1) {
        const stroke = strokes[index];
        const hitRadius = stroke.width / 2 + width / 2 + ERASE_TOLERANCE;
        if (
          point.x < stroke.minX - hitRadius ||
          point.x > stroke.maxX + hitRadius ||
          point.y < stroke.minY - hitRadius ||
          point.y > stroke.maxY + hitRadius
        ) {
          continue;
        }
        if (distanceToStroke(stroke, point.x, point.y) <= hitRadius) {
          apply({ type: "erase", index, stroke });
          return;
        }
      }
    },
    [apply],
  );

  const growIfNeeded = useCallback(
    (y: number, viewportHeight: number) => {
      if (viewportHeight === 0) {
        return;
      }
      const state = boardRef.current;
      if (y > state.height - viewportHeight * 0.3) {
        commit({ ...state, height: state.height + viewportHeight });
      }
    },
    [commit],
  );

  const changeBackground = useCallback(
    (background: Background) => {
      if (boardRef.current.background === background) {
        return;
      }
      apply({ type: "background", from: boardRef.current.background, to: background });
    },
    [apply],
  );

  const previewTransparency = useCallback(
    (value: number) => {
      if (transparencyStartRef.current === null) {
        transparencyStartRef.current = boardRef.current.transparency;
      }
      commit({ ...boardRef.current, transparency: value });
    },
    [commit],
  );

  const commitTransparency = useCallback(() => {
    const from = transparencyStartRef.current;
    transparencyStartRef.current = null;
    if (from === null) {
      return;
    }
    const to = boardRef.current.transparency;
    if (from === to) {
      return;
    }
    pushHistory({ type: "transparency", from, to });
  }, [pushHistory]);

  const undo = useCallback(() => {
    const command = undoRef.current.pop();
    if (!command) {
      return;
    }
    commit(applyCommand(boardRef.current, command, false));
    redoRef.current.push(command);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, [commit]);

  const redo = useCallback(() => {
    const command = redoRef.current.pop();
    if (!command) {
      return;
    }
    commit(applyCommand(boardRef.current, command, true));
    undoRef.current.push(command);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, [commit]);

  const clear = useCallback(() => {
    const snapshot = {
      background: boardRef.current.background,
      transparency: boardRef.current.transparency,
      strokes: boardRef.current.strokes,
    };
    commit(applyCommand(boardRef.current, { type: "clear", snapshot }, true));
    undoRef.current = [];
    redoRef.current = [];
    transparencyStartRef.current = null;
    setHistory({ undo: 0, redo: 0 });
  }, [commit]);

  const replace = useCallback(
    (next: BoardState) => {
      commit(next);
      undoRef.current = [];
      redoRef.current = [];
      transparencyStartRef.current = null;
      setHistory({ undo: 0, redo: 0 });
    },
    [commit],
  );

  return {
    board,
    boardRef,
    history,
    ensureHeight,
    commitStroke,
    eraseAt,
    growIfNeeded,
    changeBackground,
    previewTransparency,
    commitTransparency,
    undo,
    redo,
    clear,
    replace,
  };
}
