export type Mode = "web" | "blackboard";

export type RemoteStatus = "absent" | "loading" | "ok" | "failed";

export interface Settings {
  mode: Mode;
  remoteStatus: RemoteStatus;
  serverOrigin: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardPayload {
  file: string | null;
  content: string | null;
  fileMissing: boolean;
}

export interface BoardSummary {
  file: string;
  name: string;
  modified: number;
  thumbnail: string | null;
}
