import { create } from 'zustand';

interface CanvasState {
  /** Per tree: people whose branches are collapsed. View state only — never saved to the server. */
  collapsed: Record<string, string[]>;
  showBranches: boolean;
  searchOpen: boolean;
  /** What is typed in the search box; the canvas dims and the list hides whoever doesn't match. */
  searchQuery: string;
  /** A person the current view should bring into sight (after a search). The nonce makes repeats count. */
  reveal: { personId: string; nonce: number } | null;
  helpOpen: boolean;
  toggleCollapsed: (treeId: string, personId: string) => void;
  setShowBranches: (show: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  requestReveal: (personId: string) => void;
  setHelpOpen: (open: boolean) => void;
}

const EMPTY: string[] = [];

export const useCanvasStore = create<CanvasState>((set) => ({
  collapsed: {},
  showBranches: true,
  searchOpen: false,
  searchQuery: '',
  reveal: null,
  helpOpen: false,
  toggleCollapsed: (treeId, personId) =>
    set((state) => {
      const current = state.collapsed[treeId] ?? EMPTY;
      const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];
      return { collapsed: { ...state.collapsed, [treeId]: next } };
    }),
  setShowBranches: (showBranches) => set({ showBranches }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  requestReveal: (personId) => set((state) => ({ reveal: { personId, nonce: (state.reveal?.nonce ?? 0) + 1 } })),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));

export function useCollapsed(treeId: string): string[] {
  return useCanvasStore((state) => state.collapsed[treeId] ?? EMPTY);
}
