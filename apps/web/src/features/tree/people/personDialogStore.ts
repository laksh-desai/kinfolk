import { create } from 'zustand';

interface PersonDialogState {
  /** The person whose delete confirmation is open, from the panel or a card's menu. */
  deletingId: string | null;
  openDelete: (personId: string) => void;
  close: () => void;
}

export const usePersonDialogs = create<PersonDialogState>((set) => ({
  deletingId: null,
  openDelete: (personId) => set({ deletingId: personId }),
  close: () => set({ deletingId: null }),
}));
