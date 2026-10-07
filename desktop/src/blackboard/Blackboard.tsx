import { useCallback, useEffect, useRef, useState } from "react";
import { message, save } from "@tauri-apps/plugin-dialog";

import { BlackboardToolbar } from "./BlackboardToolbar";
import { DEFAULT_BACKGROUND, DEFAULT_TRANSPARENCY, parseBoard, type BoardState, type Panel, type Tool } from "./model";
import { backgroundStyleFor, renderBoardPng, renderBoardThumbnail } from "./render";
import { useBoardCanvas } from "./useBoardCanvas";
import { useBoardDocument } from "./useBoardDocument";
import {
  autoSaveBoard,
  deleteBoard,
  exportPng,
  getBoard,
  listBoards,
  newBoard,
  openBoard,
  saveBoard,
  saveBoardCopy,
} from "../shared/ipc";
import type { BoardSummary } from "../shared/types";
import "./blackboard.css";

const DEFAULT_COLOR = "#ffffff";
const DEFAULT_WIDTH = 4;
const AUTO_SAVE_DELAY = 800;
const TOAST_DURATION = 1600;

type Confirm = { kind: "new" } | { kind: "open"; path: string };

export function Blackboard() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const boardDocument = useBoardDocument();
  const { board, history, clear, replace, changeBackground, previewTransparency, commitTransparency, undo, redo } =
    boardDocument;
  const [panel, setPanel] = useState<Panel>("pen");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_WIDTH);
  const [ready, setReady] = useState(false);
  const [boundFile, setBoundFile] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [boardList, setBoardList] = useState<BoardSummary[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const saveFailedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const { viewport, scrollY, setScroll, handlers } = useBoardCanvas({
    surfaceRef,
    canvasRef,
    boardDocument,
    tool,
    color,
    strokeWidth,
    enabled: ready,
  });

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, TOAST_DURATION);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getBoard()
      .then(payload => {
        if (cancelled) {
          return;
        }
        setBoundFile(payload.file);
        if (payload.fileMissing) {
          void message("上次保存的工程无法读取，已恢复自动暂存的草稿。", {
            title: "榕课堂",
            kind: "warning",
          });
        }
        if (payload.content) {
          const parsed = parseBoard(payload.content);
          if (parsed) {
            replace(parsed);
          } else {
            void message("自动暂存的草稿已损坏，未能恢复。", { title: "榕课堂", kind: "error" });
          }
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setReady(true);
        void message(`读取黑板数据失败：${String(error)}`, { title: "榕课堂", kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [replace]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = setTimeout(() => {
      void autoSaveBoard(JSON.stringify(board))
        .then(() => {
          saveFailedRef.current = false;
        })
        .catch((error: unknown) => {
          if (!saveFailedRef.current) {
            saveFailedRef.current = true;
            void message(`自动暂存失败：${String(error)}`, { title: "榕课堂", kind: "error" });
          }
        });
    }, AUTO_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [board, ready]);

  const buildSaveContent = useCallback(async () => {
    const blob = await renderBoardThumbnail(board, viewport.width);
    return JSON.stringify({ ...board, thumbnail: await blobToBase64(blob) });
  }, [board, viewport.width]);

  const saveToCurrent = useCallback(async () => {
    setSaveModalOpen(false);
    try {
      const path = await saveBoard(await buildSaveContent());
      setBoundFile(path);
      showToast("已保存");
    } catch (error: unknown) {
      void message(`保存失败：${String(error)}`, { title: "榕课堂", kind: "error" });
    }
  }, [buildSaveContent, showToast]);

  const saveCopy = useCallback(async () => {
    setSaveModalOpen(false);
    try {
      const path = await saveBoardCopy(await buildSaveContent());
      setBoundFile(path);
      showToast("已保存为新副本");
    } catch (error: unknown) {
      void message(`保存失败：${String(error)}`, { title: "榕课堂", kind: "error" });
    }
  }, [buildSaveContent, showToast]);

  const refreshList = useCallback(async () => {
    setBoardList(null);
    try {
      setBoardList(await listBoards());
    } catch (error: unknown) {
      setBoardList([]);
      void message(`读取工程列表失败：${String(error)}`, { title: "榕课堂", kind: "error" });
    }
  }, []);

  const openSaveModal = useCallback(() => {
    setConfirm(null);
    setSaveModalOpen(true);
  }, []);

  const openOpenModal = useCallback(() => {
    setConfirm(null);
    setOpenModalOpen(true);
    setDeleteTarget(null);
    void refreshList();
  }, [refreshList]);

  const runOpen = useCallback(
    async (path: string) => {
      setConfirm(null);
      try {
        const content = await openBoard(path);
        const parsed = parseBoard(content);
        if (!parsed) {
          void message("该工程文件已损坏，无法打开。", { title: "榕课堂", kind: "error" });
          return;
        }
        replace(parsed);
        setScroll(0);
        setBoundFile(path);
        setOpenModalOpen(false);
        showToast("已打开");
      } catch (error: unknown) {
        void message(`打开失败：${String(error)}`, { title: "榕课堂", kind: "error" });
      }
    },
    [replace, setScroll, showToast],
  );

  const requestOpen = useCallback(
    (path: string) => {
      if (hasContent(board)) {
        setConfirm({ kind: "open", path });
      } else {
        void runOpen(path);
      }
    },
    [board, runOpen],
  );

  const removeBoard = useCallback(
    async (path: string) => {
      try {
        await deleteBoard(path);
        setDeleteTarget(null);
        setBoardList(list => list?.filter(item => item.file !== path) ?? null);
        if (boundFile === path) {
          setBoundFile(null);
        }
      } catch (error: unknown) {
        void message(`删除失败：${String(error)}`, { title: "榕课堂", kind: "error" });
      }
    },
    [boundFile],
  );

  const handleClear = useCallback(() => {
    const empty = {
      ...board,
      background: DEFAULT_BACKGROUND,
      transparency: DEFAULT_TRANSPARENCY,
      strokes: [],
    };
    setConfirm(null);
    clear();
    setScroll(0);
    setBoundFile(null);
    void newBoard(JSON.stringify(empty)).catch((error: unknown) => {
      void message(`重置暂存失败：${String(error)}`, { title: "榕课堂", kind: "error" });
    });
  }, [board, clear, setScroll]);

  const runConfirm = useCallback(() => {
    if (!confirm) {
      return;
    }
    if (confirm.kind === "new") {
      handleClear();
    } else {
      void runOpen(confirm.path);
    }
  }, [confirm, handleClear, runOpen]);

  const handleExport = useCallback(async () => {
    let selected: string | null = null;
    try {
      selected = await save({
        defaultPath: `黑板-${timestamp(new Date())}.png`,
        filters: [{ name: "PNG 图片", extensions: ["png"] }],
      });
    } catch (error: unknown) {
      void message(`打开保存对话框失败：${String(error)}`, { title: "榕课堂", kind: "error" });
      return;
    }
    if (!selected) {
      return;
    }
    const target = selected.toLowerCase().endsWith(".png") ? selected : `${selected}.png`;
    try {
      const blob = await renderBoardPng(board, viewport.width);
      await exportPng(target, await blobToBase64(blob));
      showToast("已导出 PNG");
    } catch (error: unknown) {
      void message(`导出失败：${String(error)}`, { title: "榕课堂", kind: "error" });
    }
  }, [board, viewport.width, showToast]);

  const selectTool = useCallback((next: Tool) => {
    setTool(next);
    setPanel(next);
  }, []);

  return (
    <div className="blackboard">
      <div className="blackboard-surface" ref={surfaceRef}>
        <div
          className="blackboard-background"
          style={backgroundStyleFor(board.background, scrollY, board.transparency)}
        />
        <canvas ref={canvasRef} className="blackboard-canvas" {...handlers} />
        <div className="blackboard-toolbars">
          <BlackboardToolbar
            panel={panel}
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            background={board.background}
            transparency={board.transparency}
            canUndo={history.undo > 0}
            canRedo={history.redo > 0}
            onSelectTool={selectTool}
            onSelectPanel={setPanel}
            onColorChange={setColor}
            onWidthChange={setStrokeWidth}
            onBackgroundChange={changeBackground}
            onTransparencyPreview={previewTransparency}
            onTransparencyCommit={commitTransparency}
            onUndo={undo}
            onRedo={redo}
            onNew={() => setConfirm({ kind: "new" })}
            onSave={openSaveModal}
            onOpen={openOpenModal}
            onExport={() => void handleExport()}
          />
        </div>
        {saveModalOpen && (
          <div className="blackboard-modal-backdrop">
            <div className="blackboard-modal">
              <p>保存画布</p>
              <div className="blackboard-modal-options">
                <button type="button" disabled={!boundFile} onClick={() => void saveToCurrent()}>
                  <span>保存到当前工程</span>
                  <small>{boundFile ? projectName(boundFile) : "当前画布还没有工程"}</small>
                </button>
                <button type="button" onClick={() => void saveCopy()}>
                  <span>保存到新副本</span>
                  <small>创建一个新工程并切换到它</small>
                </button>
              </div>
              <div className="blackboard-modal-actions">
                <button type="button" onClick={() => setSaveModalOpen(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
        {openModalOpen && (
          <div className="blackboard-modal-backdrop">
            <div className="blackboard-modal wide">
              <p>打开工程</p>
              {boardList === null && <div className="blackboard-empty">正在读取…</div>}
              {boardList !== null && boardList.length === 0 && (
                <div className="blackboard-empty">还没有保存过任何工程。</div>
              )}
              {boardList !== null && boardList.length > 0 && (
                <ul className="blackboard-board-list">
                  {boardList.map(item => (
                    <li key={item.file} className={item.file === boundFile ? "current" : ""}>
                      {item.thumbnail ? (
                        <img
                          className="blackboard-board-thumb"
                          src={`data:image/png;base64,${item.thumbnail}`}
                          alt=""
                        />
                      ) : (
                        <div className="blackboard-board-thumb" />
                      )}
                      <div className="blackboard-board-meta">
                        <span className="name">{item.name}</span>
                        <span className="time">{formatTime(item.modified)}</span>
                      </div>
                      {deleteTarget === item.file ? (
                        <div className="blackboard-board-actions">
                          <button type="button" className="confirm-danger" onClick={() => void removeBoard(item.file)}>
                            确认删除
                          </button>
                          <button type="button" onClick={() => setDeleteTarget(null)}>
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="blackboard-board-actions">
                          <button type="button" onClick={() => requestOpen(item.file)}>
                            打开
                          </button>
                          <button type="button" className="danger" onClick={() => setDeleteTarget(item.file)}>
                            删除
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="blackboard-modal-actions">
                <button type="button" onClick={() => setOpenModalOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
        {confirm !== null && (
          <div className="blackboard-modal-backdrop">
            <div className="blackboard-modal">
              <p>
                {confirm.kind === "new"
                  ? "新建将清空当前画布，且无法撤销。"
                  : "打开工程将替换当前画布，当前内容已自动暂存。"}
              </p>
              <div className="blackboard-modal-actions">
                <button type="button" onClick={() => setConfirm(null)}>
                  取消
                </button>
                <button type="button" className="danger" onClick={runConfirm}>
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
        {toast !== null && <div className="blackboard-toast">{toast}</div>}
      </div>
    </div>
  );
}

function hasContent(board: BoardState): boolean {
  return (
    board.strokes.length > 0 || board.background !== DEFAULT_BACKGROUND || board.transparency !== DEFAULT_TRANSPARENCY
  );
}

function projectName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name.replace(/\.json$/i, "");
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("unexpected reader result"));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("failed to read blob"));
    reader.readAsDataURL(blob);
  });
}
