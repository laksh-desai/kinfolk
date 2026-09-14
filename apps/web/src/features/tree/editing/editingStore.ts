import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import { create } from 'zustand';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'offline' | 'error';

export interface HistoryEntry {
  /** What the change did, in words: "Added Maya as Ravi’s cousin". */
  label: string;
  /** Ops that reverse the change, as returned by the server. */
  ops: ChangeOp[];
}

export interface TreeEditingState {
  status: SaveStatus;
  lastSavedAt: number | null;
  pending: number;
  retryAt: number | null;
  errorMessage: string | null;
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

export const HISTORY_LIMIT = 100;

const initial = (): TreeEditingState => ({
  status: 'idle',
  lastSavedAt: null,
  pending: 0,
  retryAt: null,
  errorMessage: null,
  undo: [],
  redo: [],
});

interface EditingStore {
  trees: Record<string, TreeEditingState>;
  update: (treeId: string, change: (state: TreeEditingState) => Partial<TreeEditingState>) => void;
  reset: (treeId: string) => void;
}

/** Save status and undo/redo history per tree. UI state only; the server holds the data. */
export const useEditingStore = create<EditingStore>((set) => ({
  trees: {},
  update: (treeId, change) =>
    set((store) => {
      const current = store.trees[treeId] ?? initial();
      return { trees: { ...store.trees, [treeId]: { ...current, ...change(current) } } };
    }),
  reset: (treeId) => set((store) => ({ trees: { ...store.trees, [treeId]: initial() } })),
}));

const EMPTY = initial();

export function useTreeEditingState(treeId: string): TreeEditingState {
  return useEditingStore((store) => store.trees[treeId] ?? EMPTY);
}

export function getTreeEditingState(treeId: string): TreeEditingState {
  return useEditingStore.getState().trees[treeId] ?? EMPTY;
}

export function pushHistory(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...stack, entry].slice(-HISTORY_LIMIT);
}
