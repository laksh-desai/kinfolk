import { create } from 'zustand';

export interface ToastAction {
  label: string;
  /** Plain-language description of what the action does, for screen readers. */
  altText: string;
  onAction: () => void;
}

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: 'neutral' | 'success' | 'error';
  action?: ToastAction;
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id' | 'durationMs' | 'tone'> & Partial<Pick<ToastItem, 'durationMs' | 'tone'>>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    // Toasts with an Undo stay longer: people over 50 on a trackpad need time to reach it.
    const durationMs = toast.durationMs ?? (toast.action ? 10_000 : 5_000);
    set((state) => ({ toasts: [...state.toasts.slice(-3), { tone: 'neutral', ...toast, id, durationMs }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const toast = (input: Parameters<ToastState['push']>[0]) => useToasts.getState().push(input);
