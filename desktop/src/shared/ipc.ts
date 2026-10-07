import { invoke } from "@tauri-apps/api/core";

import type { BoardPayload, BoardSummary, Bounds, Mode, Settings } from "./types";

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args).catch((error: unknown) => {
    void invoke("log_frontend", { message: `invoke ${command} failed: ${String(error)}` }).catch(() => {});
    throw error;
  });
}

export function openPlatform(): Promise<void> {
  return call("open_platform");
}

export function closePlatform(): Promise<void> {
  return call("close_platform");
}

export function setMode(mode: Mode): Promise<void> {
  return call("set_mode", { mode });
}

export function getSettings(): Promise<Settings> {
  return call("get_settings");
}

export function setRemoteBounds(bounds: Bounds): Promise<void> {
  return call("set_remote_bounds", { ...bounds });
}

export function retryRemote(): Promise<void> {
  return call("retry_remote");
}

export function showButtonMenu(): Promise<void> {
  return call("show_button_menu");
}

export function getBoard(): Promise<BoardPayload> {
  return call("get_board");
}

export function autoSaveBoard(content: string): Promise<void> {
  return call("auto_save_board", { content });
}

export function saveBoard(content: string): Promise<string> {
  return call("save_board", { content });
}

export function saveBoardCopy(content: string): Promise<string> {
  return call("save_board_copy", { content });
}

export function listBoards(): Promise<BoardSummary[]> {
  return call("list_boards");
}

export function openBoard(path: string): Promise<string> {
  return call("open_board", { path });
}

export function deleteBoard(path: string): Promise<void> {
  return call("delete_board", { path });
}

export function newBoard(content: string): Promise<void> {
  return call("new_board", { content });
}

export function exportPng(path: string, data: string): Promise<void> {
  return call("export_png", { path, data });
}
