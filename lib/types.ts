// Shared response types between admin pages and server routes.
// This is the contract the UI depends on; keep it in sync with the route files.

export type ClassSummary = { id: string; name: string };

export type ClassItem = {
  id: string;
  name: string;
  termYear: number;
  termNum: number;
  status: number;
  studentCount?: number;
  groupCount?: number;
};

export type GroupItem = { id: string; name: string; classId?: string; status: number };

export type Student = {
  id: string;
  name: string;
  no?: string | null;
  sex: number;
  groupId?: string | null;
  groupName?: string | null;
  status: number;
  balance: number;
  createdAt: number;
};

export type Reason = { id: string; name: string; parentId?: string | null; status: number };

// Client (classroom device) shared shapes.
export type CreditValues = { amount: number; reasonId: string };
export type CreditTarget = { key: string; direction: 1 | -1; ids: string[]; label?: string };
export type ReasonStage = {
  id: string;
  name: string;
  hasChildren: boolean;
  children: { value: string; label: string }[];
};
