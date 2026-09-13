import { create } from 'zustand';

interface CanvasState {
  /** Per tree: people whose branches are collapsed. View state only — never saved to the server. */
  collapsed: Record<string, string[]>;
  showBranches: boolean;
  searchOpen: boolean;
  toggleCollapsed: (treeId: string, personId: string) => void;
  setShowBranches: (show: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

const EMPTY: string[] = [];

export const useCanvasStore = create<CanvasState>((set) => ({
  collapsed: {},
  showBranches: true,
  searchOpen: false,
  toggleCollapsed: (treeId, personId) =>
    set((state) => {
      const current = state.collapsed[treeId] ?? EMPTY;
      const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];
      return { collapsed: { ...state.collapsed, [treeId]: next } };
    }),
  setShowBranches: (showBranches) => set({ showBranches }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}));

export function useCollapsed(treeId: string): string[] {
  return useCanvasStore((state) => state.collapsed[treeId] ?? EMPTY);
}
